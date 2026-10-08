import { VectorRecord, SearchResultItem, DistanceMetric, MetadataFilter } from "../types/index.js";
import {
  cosineSimilarity,
  dotProduct,
  euclideanSimilarity,
  validateVectorDimension,
} from "./distance.js";
import { matchesMetadataFilter } from "./filter.js";

export interface IVectorIndex {
  add(record: VectorRecord): void;
  addBatch(records: VectorRecord[]): void;
  get(id: string): VectorRecord | undefined;
  delete(id: string): boolean;
  clear(): void;
  size(): number;
  search(queryVector: number[], topK: number, filter?: MetadataFilter): SearchResultItem[];
}

export class FlatVectorIndex implements IVectorIndex {
  private records: Map<string, VectorRecord> = new Map();
  private dimension: number;
  private metric: DistanceMetric;

  constructor(dimension: number, metric: DistanceMetric = "cosine") {
    this.dimension = dimension;
    this.metric = metric;
  }

  add(record: VectorRecord): void {
    validateVectorDimension(record.vector, this.dimension);
    this.records.set(record.id, record);
  }

  addBatch(records: VectorRecord[]): void {
    for (const r of records) {
      this.add(r);
    }
  }

  get(id: string): VectorRecord | undefined {
    return this.records.get(id);
  }

  delete(id: string): boolean {
    return this.records.delete(id);
  }

  clear(): void {
    this.records.clear();
  }

  size(): number {
    return this.records.size;
  }

  getAll(): VectorRecord[] {
    return Array.from(this.records.values());
  }

  private computeScore(queryVector: number[], targetVector: number[]): number {
    switch (this.metric) {
      case "cosine":
        return cosineSimilarity(queryVector, targetVector);
      case "dot":
        return dotProduct(queryVector, targetVector);
      case "euclidean":
        return euclideanSimilarity(queryVector, targetVector);
      default:
        return cosineSimilarity(queryVector, targetVector);
    }
  }

  search(queryVector: number[], topK = 10, filter?: MetadataFilter): SearchResultItem[] {
    validateVectorDimension(queryVector, this.dimension);

    const candidates: SearchResultItem[] = [];

    for (const record of this.records.values()) {
      if (!matchesMetadataFilter(record.metadata, filter)) {
        continue;
      }

      const score = this.computeScore(queryVector, record.vector);
      candidates.push({
        id: record.id,
        score,
        dense_score: score,
        text: record.text,
        content_ref: record.content_ref,
        metadata: record.metadata,
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, Math.max(1, topK));
  }
}
