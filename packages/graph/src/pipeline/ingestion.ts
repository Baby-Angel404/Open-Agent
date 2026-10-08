import * as crypto from "node:crypto";
import { ingestDocument as chunkDoc } from "@open-agent/vector";
import { Entity, Relationship, Evidence, EntityMention } from "../types/index.js";
import { IGraphStorage } from "../storage/graph-storage.js";
import { EntityResolver } from "../resolution/resolver.js";
import { IEntityExtractor, IRelationshipExtractor } from "../extractors/base.js";
import {
  RuleBasedEntityExtractor,
  RuleBasedRelationshipExtractor,
} from "../extractors/rule-based.js";

export interface GraphIngestionOptions {
  storage: IGraphStorage;
  entityExtractor?: IEntityExtractor;
  relationshipExtractor?: IRelationshipExtractor;
  resolver?: EntityResolver;
}

export interface IngestionResult {
  document_id: string;
  chunks_count: number;
  entities_created: number;
  entities_resolved: number;
  relationships_created: number;
  evidence_created: number;
}

export interface DocumentDeletionResult {
  document_id: string;
  evidence_removed: number;
  relationships_removed: number;
  mentions_removed: number;
}

export class GraphIngestionPipeline {
  private storage: IGraphStorage;
  private entityExtractor: IEntityExtractor;
  private relationshipExtractor: IRelationshipExtractor;
  private resolver: EntityResolver;

  constructor(options: GraphIngestionOptions) {
    this.storage = options.storage;
    this.entityExtractor = options.entityExtractor || new RuleBasedEntityExtractor();
    this.relationshipExtractor =
      options.relationshipExtractor || new RuleBasedRelationshipExtractor();
    this.resolver = options.resolver || new EntityResolver();
  }

  async ingest(
    doc: {
      id: string;
      text: string;
      source?: string;
      metadata?: Record<string, unknown>;
    },
    chunkConfig?: { chunk_size?: number; overlap?: number }
  ): Promise<IngestionResult> {
    // 1. Clean previous document artifacts to support idempotent incremental ingestion
    await this.deleteDocument(doc.id);

    // 2. Chunk document using vector chunker
    const chunks = chunkDoc(
      {
        id: doc.id,
        text: doc.text,
        source: doc.source,
        metadata: doc.metadata,
      },
      chunkConfig
        ? { chunk_size: chunkConfig.chunk_size || 512, overlap: chunkConfig.overlap || 64 }
        : undefined
    );

    let entitiesCreatedCount = 0;
    let entitiesResolvedCount = 0;
    let relationshipsCreatedCount = 0;
    let evidenceCreatedCount = 0;

    for (const chunk of chunks) {
      // 3. Entity Extraction
      const rawMentions = await this.entityExtractor.extract(chunk.text, {
        document_id: doc.id,
        chunk_id: chunk.chunk_id,
      });

      const chunkResolvedEntities: Entity[] = [];

      for (const rawM of rawMentions) {
        const existingList = this.storage.listEntities();
        const { entity, isNew } = this.resolver.resolve(rawM.name, rawM.entity_type, existingList, [
          rawM.name,
        ]);

        if (isNew) {
          await this.storage.createEntity(entity);
          entitiesCreatedCount++;
        } else {
          await this.storage.updateEntity(entity);
          entitiesResolvedCount++;
        }

        chunkResolvedEntities.push(entity);

        // Record Entity Mention
        const mentionId = `mnt_${doc.id}_${chunk.chunk_id}_${crypto.randomBytes(4).toString("hex")}`;
        const mention: EntityMention = {
          mention_id: mentionId,
          entity_id: entity.entity_id,
          document_id: doc.id,
          chunk_id: chunk.chunk_id,
          text: rawM.name,
          start_offset: rawM.start_offset,
          end_offset: rawM.end_offset,
          confidence: rawM.confidence,
        };
        await this.storage.createMention(mention);
      }

      // Deduplicate entities in this chunk before relationship extraction
      const uniqueChunkEntities = Array.from(
        new Map(chunkResolvedEntities.map((e) => [e.entity_id, e])).values()
      );

      // 4. Relationship Extraction
      const rawRels = await this.relationshipExtractor.extract(chunk.text, uniqueChunkEntities, {
        document_id: doc.id,
        chunk_id: chunk.chunk_id,
      });

      for (const rawR of rawRels) {
        // Find subject and object entities
        const subject = uniqueChunkEntities.find(
          (e) => e.canonical_name.toLowerCase() === rawR.subject_name.toLowerCase()
        );
        const object = uniqueChunkEntities.find(
          (e) => e.canonical_name.toLowerCase() === rawR.object_name.toLowerCase()
        );

        if (!subject || !object || subject.entity_id === object.entity_id) {
          continue;
        }

        // 5. Evidence Creation
        const evidenceId = `ev_${doc.id}_${chunk.chunk_id}_${crypto.randomBytes(4).toString("hex")}`;
        const evidence: Evidence = {
          evidence_id: evidenceId,
          document_id: doc.id,
          chunk_id: chunk.chunk_id,
          source_text_reference: rawR.evidence_text,
          extraction_method: "RULE_BASED",
          confidence: rawR.confidence,
          created_at: new Date().toISOString(),
        };
        await this.storage.createEvidence(evidence);
        evidenceCreatedCount++;

        // 6. Relationship Deduplication / Update
        const existingRels = this.storage.findRelationships({
          subjectId: subject.entity_id,
          objectId: object.entity_id,
          predicate: rawR.predicate,
        });

        if (existingRels.length > 0) {
          const existing = existingRels[0];
          if (!existing.evidence_ids.includes(evidenceId)) {
            existing.evidence_ids.push(evidenceId);
            existing.confidence = Math.max(existing.confidence, rawR.confidence);
            await this.storage.updateRelationship(existing);
          }
        } else {
          const relId = `rel_${subject.entity_id}_${rawR.predicate.toLowerCase()}_${object.entity_id}`;
          const newRel: Relationship = {
            relationship_id: relId,
            subject_entity_id: subject.entity_id,
            predicate: rawR.predicate,
            object_entity_id: object.entity_id,
            confidence: rawR.confidence,
            evidence_ids: [evidenceId],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await this.storage.createRelationship(newRel);
          relationshipsCreatedCount++;
        }
      }
    }

    await this.storage.save();

    return {
      document_id: doc.id,
      chunks_count: chunks.length,
      entities_created: entitiesCreatedCount,
      entities_resolved: entitiesResolvedCount,
      relationships_created: relationshipsCreatedCount,
      evidence_created: evidenceCreatedCount,
    };
  }

  async deleteDocument(documentId: string): Promise<DocumentDeletionResult> {
    // 1. Find all evidence from this document
    const allEvidence = this.storage.listEvidence().filter((e) => e.document_id === documentId);
    const evIdsToRemove = new Set(allEvidence.map((e) => e.evidence_id));

    let relationshipsRemoved = 0;

    // 2. Disconnect evidence from relationships
    const allRels = this.storage.listRelationships();
    for (const rel of allRels) {
      const hasEv = rel.evidence_ids.some((id) => evIdsToRemove.has(id));
      if (hasEv) {
        rel.evidence_ids = rel.evidence_ids.filter((id) => !evIdsToRemove.has(id));
        if (rel.evidence_ids.length === 0) {
          // No more supporting evidence: delete relationship
          await this.storage.deleteRelationship(rel.relationship_id);
          relationshipsRemoved++;
        } else {
          await this.storage.updateRelationship(rel);
        }
      }
    }

    // 3. Delete evidence entries
    let evidenceRemoved = 0;
    for (const ev of allEvidence) {
      if (await this.storage.deleteEvidence(ev.evidence_id)) {
        evidenceRemoved++;
      }
    }

    // 4. Delete mentions
    const mentionsRemoved = await this.storage.deleteMentionsForDocument(documentId);

    await this.storage.save();

    return {
      document_id: documentId,
      evidence_removed: evidenceRemoved,
      relationships_removed: relationshipsRemoved,
      mentions_removed: mentionsRemoved,
    };
  }
}
