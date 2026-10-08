# Hybrid Graph RAG Architecture

The `GraphRAGEngine` synthesizes information by unifying hybrid vector search (dense embeddings + sparse BM25) with structured knowledge graph traversal.

## Grounded Retrieval Flow

```
User Query
  │
  ├── 1. Query Entity Extraction (Identify key entities in question)
  ├── 2. Vector Retrieval (Dense cosine + Sparse BM25 keyword matching)
  ├── 3. Graph Expansion (Traverse 1-2 hops around identified entities)
  ├── 4. Graph Ranking (Combine vector score, BM25 score, graph proximity, evidence confidence)
  ├── 5. Context Assembly (Structure evidence passages, entity facts, and relationships)
  └── 6. Deterministic Grounded Generation (Produces strictly supported claims with citations)
```

## Grounding & Hallucination Elimination

- The default local answer generator (`LocalDeterministicAnswerGenerator`) operates deterministically.
- If an entity or relationship is not supported by verified evidence in the local graph or passages, it is classified as `UNSUPPORTED`.
- Generates exact document and chunk citations (e.g. `[sample.md#chunk_0]`).

## Source Files

- Graph RAG Engine: [`packages/graph/src/rag/engine.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/rag/engine.ts)
- Graph Ranker: [`packages/graph/src/rag/ranker.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/rag/ranker.ts)
- Context Assembler: [`packages/graph/src/rag/assembler.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/rag/assembler.ts)
- Answer Generator: [`packages/graph/src/rag/generator.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/rag/generator.ts)
