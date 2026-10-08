import { EntityType, Entity } from "../types/index.js";

export interface ExtractedEntityMention {
  name: string;
  entity_type: EntityType;
  start_offset: number;
  end_offset: number;
  confidence: number;
}

export interface ExtractedRelationship {
  subject_name: string;
  predicate: string;
  object_name: string;
  confidence: number;
  evidence_text: string;
}

export interface IEntityExtractor {
  extract(
    text: string,
    context?: { document_id: string; chunk_id: string }
  ): Promise<ExtractedEntityMention[]>;
}

export interface IRelationshipExtractor {
  extract(
    text: string,
    entities: Entity[],
    context: { document_id: string; chunk_id: string }
  ): Promise<ExtractedRelationship[]>;
}
