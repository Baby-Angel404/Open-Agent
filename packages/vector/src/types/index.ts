export type DistanceMetric = "cosine" | "dot" | "euclidean";

export interface Collection {
  collection_id: string;
  name: string;
  dimension: number;
  metric: DistanceMetric;
  metadata_schema?: Record<string, string>;
  created_at: string;
  record_count?: number;
}

export interface CreateCollectionOptions {
  name: string;
  dimension: number;
  metric?: DistanceMetric;
  metadata_schema?: Record<string, string>;
  collection_id?: string;
}

export interface VectorRecord {
  id: string;
  collection_id: string;
  vector: number[];
  text?: string;
  content_ref?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InsertRecordInput {
  id?: string;
  vector?: number[];
  text?: string;
  content_ref?: string;
  metadata?: Record<string, unknown>;
}

export type SearchMode = "dense" | "sparse" | "hybrid";

export type FilterOperator =
  | { eq: unknown }
  | { ne: unknown }
  | { gt: number }
  | { gte: number }
  | { lt: number }
  | { lte: number }
  | { in: unknown[] }
  | { nin: unknown[] }
  | { contains: string };

export type FilterValue = unknown | FilterOperator;

export type MetadataFilter = Record<string, FilterValue>;

export interface SearchQuery {
  collection: string;
  query?: string;
  vector?: number[];
  top_k?: number;
  mode?: SearchMode;
  dense_weight?: number;
  sparse_weight?: number;
  filter?: MetadataFilter;
}

export interface SearchResultItem {
  id: string;
  score: number;
  dense_score?: number;
  sparse_score?: number;
  text?: string;
  content_ref?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total_candidates: number;
  latency_ms: number;
  mode: SearchMode;
  collection: string;
}

export interface IEmbeddingProvider {
  readonly name: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface DocumentChunk {
  chunk_id: string;
  document_id: string;
  sequence_number: number;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface ChunkingConfig {
  chunk_size: number;
  overlap: number;
  separators?: string[];
}

export interface DocumentInput {
  id?: string;
  text: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface StorageManifest {
  version: string;
  created_at: string;
  updated_at: string;
  collections: Collection[];
}
