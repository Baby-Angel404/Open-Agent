# OpenAgent Vector Engine Architecture

## 1. Overview

The OpenAgent Vector Engine (`@open-agent/vector`) is a high-performance, lightweight local retrieval engine designed for autonomous agent architectures and future Retrieval-Augmented Generation (RAG). It operates 100% locally with zero cloud dependencies or external network services.

Core capabilities:

- Multi-collection isolation and management.
- Dual-index retrieval: Dense vector search (Cosine, Dot, Euclidean) + Sparse lexical search (Okapi BM25).
- Configurable hybrid score fusion with min-max normalization.
- Ingestion and chunking pipeline for plain text and Markdown.
- Atomic, versioned local filesystem storage with integrity checksumming.
- Parallel native Rust implementation in `crates/vector-core/`.

---

## 2. Component Architecture

```
┌────────────────────────────────────────────────────────┐
│                   OpenAgent Runtime / CLI / REST API   │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                   VectorEngine Orchestrator            │
├──────────────────────────┬─────────────────────────────┤
│   Ingestion & Chunking   │      Embedding Provider     │
│   (Recursive, Markdown)  │ (Deterministic / Ollama)    │
└──────────────────────────┴─────────────────────────────┘
          │                                  │
          ▼                                  ▼
┌────────────────────────────────────────────────────────┐
│                  Collection Container                  │
├──────────────────────────────┬─────────────────────────┤
│       FlatVectorIndex        │     BM25SparseIndex     │
│       (Dense Vectors)        │    (Lexical Inverted)   │
└──────────────────────────────┴─────────────────────────┘
          │                                  │
          └────────────────┬─────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│                     HybridRanker                       │
│           (Min-Max Normalization + Fusion)             │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│              IStorageBackend (FileSystem)              │
│       (manifest.json + atomic collection files)        │
└────────────────────────────────────────────────────────┘
```

---

## 3. Collection Model

A collection groups vector records sharing a fixed dimensionality and distance metric.

```typescript
export interface Collection {
  collection_id: string; // Unique slug identifier
  name: string; // Human-readable collection name
  dimension: number; // Fixed vector dimension (e.g. 64, 384, 1536)
  metric: DistanceMetric; // "cosine" | "dot" | "euclidean"
  metadata_schema?: Record<string, string>;
  created_at: string; // ISO-8601 timestamp
  record_count?: number; // Active record count
}
```

Validation invariants:

- Dimensionality must be a positive integer > 0.
- Distance metric must be strictly `cosine`, `dot`, or `euclidean`.
- Duplicate collection IDs reject insertion.

---

## 4. Vector Record Format

```typescript
export interface VectorRecord {
  id: string; // Unique record identifier
  collection_id: string; // Parent collection ID
  vector: number[]; // Floating-point dense vector
  text?: string; // Raw text representation for BM25
  content_ref?: string; // File path or URI reference
  metadata?: Record<string, unknown>; // Arbitrary filterable key-value pairs
  created_at: string; // ISO-8601 creation timestamp
  updated_at: string; // ISO-8601 last update timestamp
}
```

---

## 5. REST API Endpoints

All endpoints are versioned under `/api/v1/`:

| Method   | Endpoint                                    | Description                                                 |
| -------- | ------------------------------------------- | ----------------------------------------------------------- |
| `GET`    | `/api/v1/collections`                       | List all collections with status                            |
| `POST`   | `/api/v1/collections`                       | Create new collection (`name`, `dimension`, `metric`)       |
| `GET`    | `/api/v1/collections/:id`                   | Get collection metadata                                     |
| `DELETE` | `/api/v1/collections/:id`                   | Delete collection and records                               |
| `POST`   | `/api/v1/collections/:id/records`           | Insert or batch insert records                              |
| `GET`    | `/api/v1/collections/:id/records/:recordId` | Retrieve single record                                      |
| `DELETE` | `/api/v1/collections/:id/records/:recordId` | Delete single record                                        |
| `POST`   | `/api/v1/documents`                         | Ingest and chunk document (`text`, `chunk_size`, `overlap`) |
| `POST`   | `/api/v1/search`                            | Search collection (`query`, `mode`, `top_k`, `filter`)      |
