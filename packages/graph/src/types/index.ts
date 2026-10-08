export type EntityType =
  | "PERSON"
  | "ORGANIZATION"
  | "LOCATION"
  | "PRODUCT"
  | "CONCEPT"
  | "EVENT"
  | "TECHNOLOGY"
  | "DOCUMENT"
  | string;

export interface Entity {
  entity_id: string;
  canonical_name: string;
  entity_type: EntityType;
  aliases: string[];
  description?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EntityMention {
  mention_id: string;
  entity_id: string;
  document_id: string;
  chunk_id: string;
  text: string;
  start_offset: number;
  end_offset: number;
  confidence: number;
}

export interface Relationship {
  relationship_id: string;
  subject_entity_id: string;
  predicate: string;
  object_entity_id: string;
  confidence: number;
  evidence_ids: string[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ExtractionMethod = "RULE_BASED" | "MODEL_BASED" | "MANUAL" | "IMPORTED" | "DERIVED";

export interface Evidence {
  evidence_id: string;
  document_id: string;
  chunk_id: string;
  source_text_reference: string;
  extraction_method: ExtractionMethod;
  confidence: number;
  created_at: string;
}

export interface TraversalLimits {
  max_depth?: number;
  max_nodes?: number;
  max_edges?: number;
  timeout_ms?: number;
}

export interface NeighborOptions {
  depth?: number;
  relationship_types?: string[];
  direction?: "out" | "in" | "both";
  limits?: TraversalLimits;
}

export interface PathResult {
  found: boolean;
  paths: Array<{
    entities: Entity[];
    relationships: Relationship[];
  }>;
}

export interface TraversalResult {
  center_entity: Entity;
  nodes: Entity[];
  edges: Relationship[];
  evidence: Evidence[];
}

export interface StructuredGraphQuery {
  entity?: string;
  entity_type?: string;
  predicate?: string;
  depth?: number;
  max_nodes?: number;
  relationship_types?: string[];
  filters?: Record<string, unknown>;
}

export interface GraphVerificationIssue {
  type:
    | "ORPHAN_ENTITY"
    | "ORPHAN_RELATIONSHIP"
    | "MISSING_EVIDENCE"
    | "INVALID_REFERENCE"
    | "DUPLICATE_RELATIONSHIP"
    | "BROKEN_DOCUMENT_LINK";
  id: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface GraphVerificationResult {
  valid: boolean;
  total_entities: number;
  total_relationships: number;
  total_evidence: number;
  total_mentions: number;
  issues: GraphVerificationIssue[];
}

export interface GraphRepairResult {
  repaired: boolean;
  issues_repaired: number;
  actions_taken: string[];
}

export interface RAGConfig {
  use_dense: boolean;
  use_sparse: boolean;
  use_graph: boolean;
  graph_depth: number;
  max_graph_nodes: number;
  max_graph_edges: number;
  top_k: number;
  hybrid_weight: number;
  graph_weight: number;
  minimum_evidence_confidence: number;
}

export interface RAGPassage {
  chunk_id: string;
  document_id: string;
  text: string;
  score: number;
  source_ref?: string;
  matched_entities?: string[];
}

export interface RAGContext {
  query: string;
  passages: RAGPassage[];
  entities: Entity[];
  relationships: Relationship[];
  evidence: Evidence[];
  sources: Array<{
    document_id: string;
    chunk_id: string;
    reference?: string;
  }>;
  scores: {
    vector_max: number;
    sparse_max: number;
    graph_coverage: number;
  };
}

export interface GroundedClaim {
  claim: string;
  evidence_ids: string[];
  citations: string[];
}

export interface GroundedAnswer {
  text: string;
  confidence: number;
  supported_claims: GroundedClaim[];
  unsupported_claims: string[];
  status: "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED";
}

export interface RAGQueryRequest {
  query: string;
  collection?: string;
  top_k?: number;
  graph_depth?: number;
  use_graph?: boolean;
  generate_answer?: boolean;
  config?: Partial<RAGConfig>;
}

export interface RAGResponse {
  query: string;
  answer?: GroundedAnswer;
  context: RAGContext;
  latency_ms: number;
  provenance: Array<{
    entity_or_rel: string;
    evidence: Evidence;
  }>;
  retrieval_metadata: Record<string, unknown>;
}

export interface GraphManifest {
  version: string;
  created_at: string;
  updated_at: string;
  entity_count: number;
  relationship_count: number;
  evidence_count: number;
  mention_count: number;
}

export interface GraphStorageData {
  entities: Entity[];
  relationships: Relationship[];
  evidence: Evidence[];
  mentions: EntityMention[];
}
