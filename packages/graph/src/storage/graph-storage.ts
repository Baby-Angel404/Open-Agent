import * as fs from "node:fs";
import * as path from "node:path";
import {
  Entity,
  Relationship,
  Evidence,
  EntityMention,
  GraphManifest,
  GraphStorageData,
} from "../types/index.js";
import { EntityNormalizer } from "../normalization/normalizer.js";

export const GRAPH_STORAGE_VERSION = "1.0.0";

export class CorruptedGraphStorageError extends Error {
  constructor(message: string) {
    super(`[CorruptedGraphStorage] ${message}`);
    this.name = "CorruptedGraphStorageError";
  }
}

export class IncompatibleGraphSchemaError extends Error {
  constructor(expected: string, actual: string) {
    super(`Incompatible graph storage schema version: expected ${expected}, got ${actual}`);
    this.name = "IncompatibleGraphSchemaError";
  }
}

export interface IGraphStorage {
  // Entities
  createEntity(entity: Entity): Promise<void>;
  getEntity(entityId: string): Entity | undefined;
  updateEntity(entity: Entity): Promise<void>;
  deleteEntity(entityId: string): Promise<boolean>;
  listEntities(): Entity[];
  findEntities(filter: { type?: string; nameQuery?: string; alias?: string }): Entity[];

  // Relationships
  createRelationship(rel: Relationship): Promise<void>;
  getRelationship(relationshipId: string): Relationship | undefined;
  updateRelationship(rel: Relationship): Promise<void>;
  deleteRelationship(relationshipId: string): Promise<boolean>;
  listRelationships(): Relationship[];
  findRelationships(filter: {
    predicate?: string;
    subjectId?: string;
    objectId?: string;
  }): Relationship[];

  // Evidence & Mentions
  createEvidence(evidence: Evidence): Promise<void>;
  getEvidence(evidenceId: string): Evidence | undefined;
  deleteEvidence(evidenceId: string): Promise<boolean>;
  listEvidence(): Evidence[];

  createMention(mention: EntityMention): Promise<void>;
  getMentionsForEntity(entityId: string): EntityMention[];
  getMentionsForChunk(chunkId: string): EntityMention[];
  deleteMentionsForDocument(documentId: string): Promise<number>;

  // Adjacency & Provenance
  getOutboundRelationships(entityId: string): Relationship[];
  getInboundRelationships(entityId: string): Relationship[];
  getAllRelationshipsForEntity(entityId: string): Relationship[];
  getEvidenceForEntity(entityId: string): Evidence[];
  getDocumentsForEntity(entityId: string): string[];

  // Persistence
  save(): Promise<void>;
  load(): Promise<void>;
  close(): Promise<void>;
  getManifest(): GraphManifest;
}

export class FileSystemGraphStorage implements IGraphStorage {
  private basePath: string;
  private manifestPath: string;
  private dataFilePath: string;
  private normalizer = new EntityNormalizer();

  // Storage Maps
  private entities: Map<string, Entity> = new Map();
  private relationships: Map<string, Relationship> = new Map();
  private evidenceMap: Map<string, Evidence> = new Map();
  private mentions: Map<string, EntityMention> = new Map();

  // Adjacency Maps
  private outEdges: Map<string, Set<string>> = new Map();
  private inEdges: Map<string, Set<string>> = new Map();

  // Secondary Indexes
  private indexByName: Map<string, string> = new Map();
  private indexByAlias: Map<string, Set<string>> = new Map();
  private indexByType: Map<string, Set<string>> = new Map();
  private indexByPredicate: Map<string, Set<string>> = new Map();
  private indexBySubject: Map<string, Set<string>> = new Map();
  private indexByObject: Map<string, Set<string>> = new Map();
  private indexMentionsByEntity: Map<string, EntityMention[]> = new Map();
  private indexMentionsByChunk: Map<string, EntityMention[]> = new Map();
  private indexMentionsByDoc: Map<string, EntityMention[]> = new Map();
  private indexEvidenceByDoc: Map<string, Set<string>> = new Map();

  constructor(basePath = "./.graph-store") {
    this.basePath = path.resolve(process.cwd(), basePath);
    this.manifestPath = path.join(this.basePath, "manifest.json");
    this.dataFilePath = path.join(this.basePath, "graph-data.json");

    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  // --- Entity CRUD ---

  async createEntity(entity: Entity): Promise<void> {
    if (this.entities.has(entity.entity_id)) {
      throw new Error(`Entity '${entity.entity_id}' already exists`);
    }
    this.entities.set(entity.entity_id, { ...entity });
    this.indexEntity(entity);
  }

  getEntity(entityId: string): Entity | undefined {
    const e = this.entities.get(entityId);
    return e ? { ...e } : undefined;
  }

  async updateEntity(entity: Entity): Promise<void> {
    const existing = this.entities.get(entity.entity_id);
    if (!existing) {
      throw new Error(`Entity '${entity.entity_id}' not found`);
    }
    this.unindexEntity(existing);
    this.entities.set(entity.entity_id, { ...entity, updated_at: new Date().toISOString() });
    this.indexEntity(entity);
  }

  async deleteEntity(entityId: string): Promise<boolean> {
    const existing = this.entities.get(entityId);
    if (!existing) return false;

    // Disconnect relationships attached to this entity
    const rels = this.getAllRelationshipsForEntity(entityId);
    for (const r of rels) {
      await this.deleteRelationship(r.relationship_id);
    }

    this.unindexEntity(existing);
    this.entities.delete(entityId);
    this.outEdges.delete(entityId);
    this.inEdges.delete(entityId);
    return true;
  }

  listEntities(): Entity[] {
    return Array.from(this.entities.values()).map((e) => ({ ...e }));
  }

  findEntities(filter: { type?: string; nameQuery?: string; alias?: string }): Entity[] {
    let result = Array.from(this.entities.values());

    if (filter.type) {
      const ids = this.indexByType.get(filter.type);
      if (!ids) return [];
      result = result.filter((e) => ids.has(e.entity_id));
    }

    if (filter.nameQuery) {
      const norm = this.normalizer.normalize(filter.nameQuery);
      result = result.filter(
        (e) =>
          this.normalizer.normalize(e.canonical_name).includes(norm) ||
          e.aliases.some((a) => this.normalizer.normalize(a).includes(norm))
      );
    }

    if (filter.alias) {
      const normAlias = this.normalizer.normalize(filter.alias);
      const ids = this.indexByAlias.get(normAlias);
      if (!ids) return [];
      result = result.filter((e) => ids.has(e.entity_id));
    }

    return result.map((e) => ({ ...e }));
  }

  // --- Relationship CRUD ---

  async createRelationship(rel: Relationship): Promise<void> {
    if (!this.entities.has(rel.subject_entity_id)) {
      throw new Error(`Subject entity '${rel.subject_entity_id}' does not exist in graph`);
    }
    if (!this.entities.has(rel.object_entity_id)) {
      throw new Error(`Object entity '${rel.object_entity_id}' does not exist in graph`);
    }
    if (this.relationships.has(rel.relationship_id)) {
      throw new Error(`Relationship '${rel.relationship_id}' already exists`);
    }

    this.relationships.set(rel.relationship_id, { ...rel });

    // Adjacency
    if (!this.outEdges.has(rel.subject_entity_id)) {
      this.outEdges.set(rel.subject_entity_id, new Set());
    }
    this.outEdges.get(rel.subject_entity_id)!.add(rel.relationship_id);

    if (!this.inEdges.has(rel.object_entity_id)) {
      this.inEdges.set(rel.object_entity_id, new Set());
    }
    this.inEdges.get(rel.object_entity_id)!.add(rel.relationship_id);

    // Index
    this.indexRelationship(rel);
  }

  getRelationship(relationshipId: string): Relationship | undefined {
    const r = this.relationships.get(relationshipId);
    return r ? { ...r } : undefined;
  }

  async updateRelationship(rel: Relationship): Promise<void> {
    const existing = this.relationships.get(rel.relationship_id);
    if (!existing) {
      throw new Error(`Relationship '${rel.relationship_id}' not found`);
    }
    this.unindexRelationship(existing);
    this.relationships.set(rel.relationship_id, {
      ...rel,
      updated_at: new Date().toISOString(),
    });
    this.indexRelationship(rel);
  }

  async deleteRelationship(relationshipId: string): Promise<boolean> {
    const rel = this.relationships.get(relationshipId);
    if (!rel) return false;

    this.outEdges.get(rel.subject_entity_id)?.delete(relationshipId);
    this.inEdges.get(rel.object_entity_id)?.delete(relationshipId);
    this.unindexRelationship(rel);
    this.relationships.delete(relationshipId);
    return true;
  }

  listRelationships(): Relationship[] {
    return Array.from(this.relationships.values()).map((r) => ({ ...r }));
  }

  findRelationships(filter: {
    predicate?: string;
    subjectId?: string;
    objectId?: string;
  }): Relationship[] {
    let result = Array.from(this.relationships.values());

    if (filter.predicate) {
      const ids = this.indexByPredicate.get(filter.predicate.toUpperCase());
      if (!ids) return [];
      result = result.filter((r) => ids.has(r.relationship_id));
    }

    if (filter.subjectId) {
      const ids = this.indexBySubject.get(filter.subjectId);
      if (!ids) return [];
      result = result.filter((r) => ids.has(r.relationship_id));
    }

    if (filter.objectId) {
      const ids = this.indexByObject.get(filter.objectId);
      if (!ids) return [];
      result = result.filter((r) => ids.has(r.relationship_id));
    }

    return result.map((r) => ({ ...r }));
  }

  // --- Evidence CRUD ---

  async createEvidence(evidence: Evidence): Promise<void> {
    this.evidenceMap.set(evidence.evidence_id, { ...evidence });
    if (!this.indexEvidenceByDoc.has(evidence.document_id)) {
      this.indexEvidenceByDoc.set(evidence.document_id, new Set());
    }
    this.indexEvidenceByDoc.get(evidence.document_id)!.add(evidence.evidence_id);
  }

  getEvidence(evidenceId: string): Evidence | undefined {
    const ev = this.evidenceMap.get(evidenceId);
    return ev ? { ...ev } : undefined;
  }

  async deleteEvidence(evidenceId: string): Promise<boolean> {
    const ev = this.evidenceMap.get(evidenceId);
    if (!ev) return false;
    this.indexEvidenceByDoc.get(ev.document_id)?.delete(evidenceId);
    return this.evidenceMap.delete(evidenceId);
  }

  listEvidence(): Evidence[] {
    return Array.from(this.evidenceMap.values()).map((e) => ({ ...e }));
  }

  // --- Mention CRUD ---

  async createMention(mention: EntityMention): Promise<void> {
    this.mentions.set(mention.mention_id, { ...mention });

    if (!this.indexMentionsByEntity.has(mention.entity_id)) {
      this.indexMentionsByEntity.set(mention.entity_id, []);
    }
    this.indexMentionsByEntity.get(mention.entity_id)!.push(mention);

    if (!this.indexMentionsByChunk.has(mention.chunk_id)) {
      this.indexMentionsByChunk.set(mention.chunk_id, []);
    }
    this.indexMentionsByChunk.get(mention.chunk_id)!.push(mention);

    if (!this.indexMentionsByDoc.has(mention.document_id)) {
      this.indexMentionsByDoc.set(mention.document_id, []);
    }
    this.indexMentionsByDoc.get(mention.document_id)!.push(mention);
  }

  getMentionsForEntity(entityId: string): EntityMention[] {
    return (this.indexMentionsByEntity.get(entityId) || []).map((m) => ({ ...m }));
  }

  getMentionsForChunk(chunkId: string): EntityMention[] {
    return (this.indexMentionsByChunk.get(chunkId) || []).map((m) => ({ ...m }));
  }

  async deleteMentionsForDocument(documentId: string): Promise<number> {
    const docMentions = this.indexMentionsByDoc.get(documentId) || [];
    let count = 0;
    for (const m of docMentions) {
      this.mentions.delete(m.mention_id);
      count++;
    }
    this.indexMentionsByDoc.delete(documentId);
    // Re-index remaining
    this.rebuildMentionIndexes();
    return count;
  }

  // --- Adjacency & Provenance Queries ---

  getOutboundRelationships(entityId: string): Relationship[] {
    const ids = this.outEdges.get(entityId);
    if (!ids) return [];
    const res: Relationship[] = [];
    for (const id of ids) {
      const r = this.relationships.get(id);
      if (r) res.push({ ...r });
    }
    return res;
  }

  getInboundRelationships(entityId: string): Relationship[] {
    const ids = this.inEdges.get(entityId);
    if (!ids) return [];
    const res: Relationship[] = [];
    for (const id of ids) {
      const r = this.relationships.get(id);
      if (r) res.push({ ...r });
    }
    return res;
  }

  getAllRelationshipsForEntity(entityId: string): Relationship[] {
    const set = new Set<string>();
    const out = this.outEdges.get(entityId);
    const inE = this.inEdges.get(entityId);
    if (out) out.forEach((id) => set.add(id));
    if (inE) inE.forEach((id) => set.add(id));

    const res: Relationship[] = [];
    for (const id of set) {
      const r = this.relationships.get(id);
      if (r) res.push({ ...r });
    }
    return res;
  }

  getEvidenceForEntity(entityId: string): Evidence[] {
    const rels = this.getAllRelationshipsForEntity(entityId);
    const evIds = new Set<string>();
    for (const r of rels) {
      r.evidence_ids.forEach((id) => evIds.add(id));
    }

    const res: Evidence[] = [];
    for (const id of evIds) {
      const ev = this.evidenceMap.get(id);
      if (ev) res.push({ ...ev });
    }
    return res;
  }

  getDocumentsForEntity(entityId: string): string[] {
    const docs = new Set<string>();
    const mentions = this.getMentionsForEntity(entityId);
    mentions.forEach((m) => docs.add(m.document_id));

    const ev = this.getEvidenceForEntity(entityId);
    ev.forEach((e) => docs.add(e.document_id));

    return Array.from(docs);
  }

  // --- Index Management ---

  private indexEntity(e: Entity): void {
    const normName = this.normalizer.normalize(e.canonical_name);
    this.indexByName.set(normName, e.entity_id);

    if (!this.indexByType.has(e.entity_type)) {
      this.indexByType.set(e.entity_type, new Set());
    }
    this.indexByType.get(e.entity_type)!.add(e.entity_id);

    for (const alias of e.aliases) {
      const normAlias = this.normalizer.normalize(alias);
      if (!this.indexByAlias.has(normAlias)) {
        this.indexByAlias.set(normAlias, new Set());
      }
      this.indexByAlias.get(normAlias)!.add(e.entity_id);
    }
  }

  private unindexEntity(e: Entity): void {
    const normName = this.normalizer.normalize(e.canonical_name);
    this.indexByName.delete(normName);
    this.indexByType.get(e.entity_type)?.delete(e.entity_id);
    for (const alias of e.aliases) {
      const normAlias = this.normalizer.normalize(alias);
      this.indexByAlias.get(normAlias)?.delete(e.entity_id);
    }
  }

  private indexRelationship(r: Relationship): void {
    const pred = r.predicate.toUpperCase();
    if (!this.indexByPredicate.has(pred)) {
      this.indexByPredicate.set(pred, new Set());
    }
    this.indexByPredicate.get(pred)!.add(r.relationship_id);

    if (!this.indexBySubject.has(r.subject_entity_id)) {
      this.indexBySubject.set(r.subject_entity_id, new Set());
    }
    this.indexBySubject.get(r.subject_entity_id)!.add(r.relationship_id);

    if (!this.indexByObject.has(r.object_entity_id)) {
      this.indexByObject.set(r.object_entity_id, new Set());
    }
    this.indexByObject.get(r.object_entity_id)!.add(r.relationship_id);
  }

  private unindexRelationship(r: Relationship): void {
    const pred = r.predicate.toUpperCase();
    this.indexByPredicate.get(pred)?.delete(r.relationship_id);
    this.indexBySubject.get(r.subject_entity_id)?.delete(r.relationship_id);
    this.indexByObject.get(r.object_entity_id)?.delete(r.relationship_id);
  }

  private rebuildMentionIndexes(): void {
    this.indexMentionsByEntity.clear();
    this.indexMentionsByChunk.clear();
    this.indexMentionsByDoc.clear();

    for (const m of this.mentions.values()) {
      if (!this.indexMentionsByEntity.has(m.entity_id)) {
        this.indexMentionsByEntity.set(m.entity_id, []);
      }
      this.indexMentionsByEntity.get(m.entity_id)!.push(m);

      if (!this.indexMentionsByChunk.has(m.chunk_id)) {
        this.indexMentionsByChunk.set(m.chunk_id, []);
      }
      this.indexMentionsByChunk.get(m.chunk_id)!.push(m);

      if (!this.indexMentionsByDoc.has(m.document_id)) {
        this.indexMentionsByDoc.set(m.document_id, []);
      }
      this.indexMentionsByDoc.get(m.document_id)!.push(m);
    }
  }

  // --- Persistence & Atomic Writes ---

  async save(): Promise<void> {
    const now = new Date().toISOString();
    const manifest: GraphManifest = {
      version: GRAPH_STORAGE_VERSION,
      created_at: now,
      updated_at: now,
      entity_count: this.entities.size,
      relationship_count: this.relationships.size,
      evidence_count: this.evidenceMap.size,
      mention_count: this.mentions.size,
    };

    const data: GraphStorageData = {
      entities: Array.from(this.entities.values()),
      relationships: Array.from(this.relationships.values()),
      evidence: Array.from(this.evidenceMap.values()),
      mentions: Array.from(this.mentions.values()),
    };

    // Atomic write data
    const tmpDataPath = `${this.dataFilePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpDataPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmpDataPath, this.dataFilePath);

    // Atomic write manifest
    const tmpManifestPath = `${this.manifestPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpManifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    fs.renameSync(tmpManifestPath, this.manifestPath);
  }

  async load(): Promise<void> {
    if (!fs.existsSync(this.manifestPath) || !fs.existsSync(this.dataFilePath)) {
      return;
    }

    try {
      const manifestRaw = fs.readFileSync(this.manifestPath, "utf-8");
      const manifest: GraphManifest = JSON.parse(manifestRaw);

      if (manifest.version !== GRAPH_STORAGE_VERSION) {
        throw new IncompatibleGraphSchemaError(GRAPH_STORAGE_VERSION, manifest.version);
      }

      const dataRaw = fs.readFileSync(this.dataFilePath, "utf-8");
      const data: GraphStorageData = JSON.parse(dataRaw);

      this.entities.clear();
      this.relationships.clear();
      this.evidenceMap.clear();
      this.mentions.clear();
      this.outEdges.clear();
      this.inEdges.clear();
      this.indexByName.clear();
      this.indexByAlias.clear();
      this.indexByType.clear();
      this.indexByPredicate.clear();
      this.indexBySubject.clear();
      this.indexByObject.clear();
      this.indexEvidenceByDoc.clear();

      for (const e of data.entities || []) {
        this.entities.set(e.entity_id, e);
        this.indexEntity(e);
      }

      for (const ev of data.evidence || []) {
        this.evidenceMap.set(ev.evidence_id, ev);
        if (!this.indexEvidenceByDoc.has(ev.document_id)) {
          this.indexEvidenceByDoc.set(ev.document_id, new Set());
        }
        this.indexEvidenceByDoc.get(ev.document_id)!.add(ev.evidence_id);
      }

      for (const r of data.relationships || []) {
        this.relationships.set(r.relationship_id, r);
        if (!this.outEdges.has(r.subject_entity_id)) {
          this.outEdges.set(r.subject_entity_id, new Set());
        }
        this.outEdges.get(r.subject_entity_id)!.add(r.relationship_id);

        if (!this.inEdges.has(r.object_entity_id)) {
          this.inEdges.set(r.object_entity_id, new Set());
        }
        this.inEdges.get(r.object_entity_id)!.add(r.relationship_id);

        this.indexRelationship(r);
      }

      for (const m of data.mentions || []) {
        this.mentions.set(m.mention_id, m);
      }
      this.rebuildMentionIndexes();
    } catch (err: unknown) {
      if (err instanceof IncompatibleGraphSchemaError) throw err;
      throw new CorruptedGraphStorageError(
        `Failed to parse graph storage: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  getManifest(): GraphManifest {
    return {
      version: GRAPH_STORAGE_VERSION,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      entity_count: this.entities.size,
      relationship_count: this.relationships.size,
      evidence_count: this.evidenceMap.size,
      mention_count: this.mentions.size,
    };
  }

  async close(): Promise<void> {
    await this.save();
  }
}
