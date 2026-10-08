import * as crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  Collection,
  CreateCollectionOptions,
  VectorRecord,
  InsertRecordInput,
  SearchQuery,
  SearchResponse,
  SearchResultItem,
  DocumentInput,
  ChunkingConfig,
  IEmbeddingProvider,
} from "../types/index.js";
import { FlatVectorIndex } from "../index/dense.js";
import { BM25SparseIndex } from "../index/sparse.js";
import { HybridRanker } from "../ranking/hybrid.js";
import {
  IStorageBackend,
  FileSystemStorageBackend,
  STORAGE_VERSION,
} from "../storage/fs.storage.js";
import { LocalHashEmbeddingProvider } from "../embedding/providers.js";
import { ingestDocument } from "../ingestion/chunker.js";
import { validateMetadataFilter } from "../index/filter.js";
import { validateVectorDimension } from "../index/distance.js";

export interface VectorEngineOptions {
  storage?: IStorageBackend;
  defaultEmbeddingProvider?: IEmbeddingProvider;
}

interface CollectionContainer {
  collection: Collection;
  denseIndex: FlatVectorIndex;
  sparseIndex: BM25SparseIndex;
}

export class VectorEngine {
  private storage: IStorageBackend;
  private defaultEmbeddingProvider: IEmbeddingProvider;
  private containers: Map<string, CollectionContainer> = new Map();
  private hybridRanker: HybridRanker;
  private initialized = false;

  constructor(options: VectorEngineOptions = {}) {
    this.storage = options.storage || new FileSystemStorageBackend();
    this.defaultEmbeddingProvider =
      options.defaultEmbeddingProvider || new LocalHashEmbeddingProvider(64);
    this.hybridRanker = new HybridRanker();
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const manifest = await this.storage.loadManifest();
    if (manifest) {
      for (const col of manifest.collections) {
        const dense = new FlatVectorIndex(col.dimension, col.metric);
        const sparse = new BM25SparseIndex();

        const records = await this.storage.loadCollectionRecords(col.collection_id);
        for (const r of records) {
          dense.add(r);
          sparse.add(r);
        }

        col.record_count = records.length;
        this.containers.set(col.collection_id, {
          collection: col,
          denseIndex: dense,
          sparseIndex: sparse,
        });
      }
    }

    this.initialized = true;
  }

  private async persistManifest(): Promise<void> {
    const list: Collection[] = [];
    for (const c of this.containers.values()) {
      list.push({
        ...c.collection,
        record_count: c.denseIndex.size(),
      });
    }

    await this.storage.saveManifest({
      version: STORAGE_VERSION,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      collections: list,
    });
  }

  // --- Collection CRUD ---

  async createCollection(options: CreateCollectionOptions): Promise<Collection> {
    if (!options.name || typeof options.name !== "string" || options.name.trim() === "") {
      throw new Error("Collection name must be a non-empty string");
    }
    if (!options.dimension || typeof options.dimension !== "number" || options.dimension <= 0) {
      throw new Error("Collection dimension must be a positive integer");
    }

    const id = FileSystemStorageBackend.validateCollectionId(
      options.collection_id || options.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_")
    );

    if (this.containers.has(id)) {
      throw new Error(`Collection with ID '${id}' already exists`);
    }

    const collection: Collection = {
      collection_id: id,
      name: options.name,
      dimension: options.dimension,
      metric: options.metric || "cosine",
      metadata_schema: options.metadata_schema,
      created_at: new Date().toISOString(),
      record_count: 0,
    };

    const container: CollectionContainer = {
      collection,
      denseIndex: new FlatVectorIndex(collection.dimension, collection.metric),
      sparseIndex: new BM25SparseIndex(),
    };

    this.containers.set(id, container);
    await this.persistManifest();
    return collection;
  }

  getCollection(id: string): Collection | undefined {
    const c = this.containers.get(id);
    if (!c) return undefined;
    return {
      ...c.collection,
      record_count: c.denseIndex.size(),
    };
  }

  listCollections(): Collection[] {
    return Array.from(this.containers.values()).map((c) => ({
      ...c.collection,
      record_count: c.denseIndex.size(),
    }));
  }

  async deleteCollection(id: string): Promise<boolean> {
    if (!this.containers.has(id)) {
      return false;
    }
    this.containers.delete(id);
    await this.storage.deleteCollection(id);
    await this.persistManifest();
    return true;
  }

  // --- Record CRUD ---

  private getContainerOrThrow(collectionId: string): CollectionContainer {
    const c = this.containers.get(collectionId);
    if (!c) {
      throw new Error(`Collection '${collectionId}' does not exist`);
    }
    return c;
  }

  async insert(collectionId: string, input: InsertRecordInput): Promise<VectorRecord> {
    const [rec] = await this.batchInsert(collectionId, [input]);
    return rec;
  }

  async batchInsert(collectionId: string, inputs: InsertRecordInput[]): Promise<VectorRecord[]> {
    const container = this.getContainerOrThrow(collectionId);
    const results: VectorRecord[] = [];
    const now = new Date().toISOString();

    // 1. Identify inputs needing auto-embedding
    const textsToEmbed: { index: number; text: string }[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      if (!inp.vector && inp.text) {
        textsToEmbed.push({ index: i, text: inp.text });
      }
    }

    let generatedVectors: number[][] = [];
    if (textsToEmbed.length > 0) {
      // Use local embedding provider matching collection dimension if possible
      let provider = this.defaultEmbeddingProvider;
      if (provider.dimension !== container.collection.dimension) {
        provider = new LocalHashEmbeddingProvider(container.collection.dimension);
      }
      generatedVectors = await provider.embed(textsToEmbed.map((t) => t.text));
    }

    let embedCursor = 0;
    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      let vec = inp.vector;

      if (!vec) {
        if (inp.text && embedCursor < generatedVectors.length) {
          vec = generatedVectors[embedCursor++];
        } else {
          throw new Error(
            `Record input at index ${i} requires either 'vector' or 'text' for embedding`
          );
        }
      }

      validateVectorDimension(vec, container.collection.dimension);

      const recordId = inp.id || `rec_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const record: VectorRecord = {
        id: recordId,
        collection_id: collectionId,
        vector: vec,
        text: inp.text,
        content_ref: inp.content_ref,
        metadata: inp.metadata,
        created_at: now,
        updated_at: now,
      };

      container.denseIndex.add(record);
      container.sparseIndex.add(record);
      results.push(record);
    }

    // Persist all collection records
    const allRecords = container.denseIndex.getAll();
    await this.storage.saveCollectionRecords(collectionId, allRecords);
    await this.persistManifest();

    return results;
  }

  getRecord(collectionId: string, recordId: string): VectorRecord | undefined {
    const container = this.getContainerOrThrow(collectionId);
    return container.denseIndex.get(recordId);
  }

  async updateRecord(
    collectionId: string,
    recordId: string,
    updates: Partial<InsertRecordInput>
  ): Promise<VectorRecord> {
    const container = this.getContainerOrThrow(collectionId);
    const existing = container.denseIndex.get(recordId);
    if (!existing) {
      throw new Error(`Record '${recordId}' not found in collection '${collectionId}'`);
    }

    let vec = updates.vector || existing.vector;
    if (updates.vector) {
      validateVectorDimension(updates.vector, container.collection.dimension);
    } else if (updates.text && updates.text !== existing.text) {
      // Re-embed updated text
      let provider = this.defaultEmbeddingProvider;
      if (provider.dimension !== container.collection.dimension) {
        provider = new LocalHashEmbeddingProvider(container.collection.dimension);
      }
      const [newVec] = await provider.embed([updates.text]);
      vec = newVec;
    }

    const updated: VectorRecord = {
      ...existing,
      vector: vec,
      text: updates.text !== undefined ? updates.text : existing.text,
      content_ref: updates.content_ref !== undefined ? updates.content_ref : existing.content_ref,
      metadata: updates.metadata !== undefined ? updates.metadata : existing.metadata,
      updated_at: new Date().toISOString(),
    };

    container.denseIndex.add(updated);
    container.sparseIndex.add(updated);

    await this.storage.saveCollectionRecords(collectionId, container.denseIndex.getAll());
    return updated;
  }

  async deleteRecord(collectionId: string, recordId: string): Promise<boolean> {
    const container = this.getContainerOrThrow(collectionId);
    const d1 = container.denseIndex.delete(recordId);
    const d2 = container.sparseIndex.delete(recordId);
    if (d1 || d2) {
      await this.storage.saveCollectionRecords(collectionId, container.denseIndex.getAll());
      await this.persistManifest();
      return true;
    }
    return false;
  }

  async batchDelete(collectionId: string, recordIds: string[]): Promise<number> {
    const container = this.getContainerOrThrow(collectionId);
    let count = 0;
    for (const id of recordIds) {
      if (container.denseIndex.delete(id)) {
        container.sparseIndex.delete(id);
        count++;
      }
    }
    if (count > 0) {
      await this.storage.saveCollectionRecords(collectionId, container.denseIndex.getAll());
      await this.persistManifest();
    }
    return count;
  }

  // --- Document Ingestion & Chunking ---

  async ingestDocument(
    collectionId: string,
    doc: DocumentInput,
    chunkConfig?: ChunkingConfig
  ): Promise<VectorRecord[]> {
    const chunks = ingestDocument(doc, chunkConfig);
    const inputs: InsertRecordInput[] = chunks.map((chk) => ({
      id: chk.chunk_id,
      text: chk.text,
      content_ref: doc.source,
      metadata: chk.metadata,
    }));
    return await this.batchInsert(collectionId, inputs);
  }

  // --- Search Execution ---

  async search(query: SearchQuery): Promise<SearchResponse> {
    const t0 = performance.now();
    const container = this.getContainerOrThrow(query.collection);
    const mode = query.mode || "hybrid";
    const topK = query.top_k || 10;

    validateMetadataFilter(query.filter);

    let denseResults: SearchResultItem[] = [];
    let sparseResults: SearchResultItem[] = [];

    // Dense search phase
    if (mode === "dense" || mode === "hybrid") {
      let qVec = query.vector;
      if (!qVec && query.query) {
        let provider = this.defaultEmbeddingProvider;
        if (provider.dimension !== container.collection.dimension) {
          provider = new LocalHashEmbeddingProvider(container.collection.dimension);
        }
        const [embedded] = await provider.embed([query.query]);
        qVec = embedded;
      }

      if (qVec) {
        denseResults = container.denseIndex.search(qVec, topK * 2, query.filter);
      }
    }

    // Sparse search phase
    if (mode === "sparse" || mode === "hybrid") {
      if (query.query) {
        sparseResults = container.sparseIndex.search(query.query, topK * 2, query.filter);
      }
    }

    // Merging & Ranking
    let finalResults: SearchResultItem[] = [];

    if (mode === "dense") {
      finalResults = denseResults.slice(0, topK);
    } else if (mode === "sparse") {
      finalResults = sparseResults.slice(0, topK);
    } else {
      // Hybrid mode
      finalResults = this.hybridRanker.rank(
        denseResults,
        sparseResults,
        topK,
        query.dense_weight,
        query.sparse_weight
      );
    }

    const duration = performance.now() - t0;
    const totalCandidates = new Set([
      ...denseResults.map((r) => r.id),
      ...sparseResults.map((r) => r.id),
    ]).size;

    return {
      results: finalResults,
      total_candidates: totalCandidates,
      latency_ms: Number(duration.toFixed(3)),
      mode,
      collection: query.collection,
    };
  }

  async close(): Promise<void> {
    await this.storage.close();
  }
}
