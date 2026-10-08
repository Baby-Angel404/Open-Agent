# Knowledge Graph Architecture

OpenAgent Knowledge Graph is a local-first, verifiable knowledge graph layer integrated with the OpenAgent Hybrid Vector Engine and Agent Runtime.

## System Topology

```
Ingestion Pipeline
  ├─ Rule-Based / Model Extractors
  ├─ Normalization & Conservative Resolver
  └─ FileSystemGraphStorage (Atomic JSON, Secondary Indexes)
Retrieval & Reasoning
  ├─ GraphTraversalEngine (BFS, Depth & Timeout Guards)
  ├─ GraphRanker (Vector + BM25 + Proximity + Confidence)
  └─ GraphRAGEngine -> Grounded Answer Synthesis
```

## Key Invariants

- **100% Local Execution**: Operates completely offline with zero compulsory cloud dependencies.
- **Strict Provenance**: Every entity and relationship links back to concrete source chunks via immutable `Evidence` records.
- **Security Boundary**: Knowledge graph data is untrusted user content and can never override policy decisions or execute code.
- **Dual Native & TypeScript Implementation**: Core schemas and traversal ported to Rust (`crates/graph-core`) for low-latency operations alongside TypeScript (`packages/graph`).

## Source Files

- Implementation: [`packages/graph/src/index.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/index.ts)
- Native Core: [`crates/graph-core/src/lib.rs`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/crates/graph-core/src/lib.rs)
- REST API Server: [`packages/core/src/api/server.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/core/src/api/server.ts)
