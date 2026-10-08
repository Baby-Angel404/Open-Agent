# Knowledge Graph Ingestion Pipeline

The ingestion pipeline converts unstructured documents into structured entities, relationships, mentions, and evidence.

## Ingestion Flow

```
Document -> Chunking -> Entity Extraction -> Resolution -> Relationship Extraction -> Storage & Indexing
```

1. **Chunking**: Uses `@open-agent/vector` deterministic chunker with configurable size and overlap.
2. **Entity Extraction**:
   - `RuleBasedEntityExtractor`: Zero-network, fast keyword/pattern extractor with exact character offset tracking.
   - `OpenAIEntityExtractor` / Ollama: Optional LLM-based structured extractor adhering to JSON schemas.
3. **Entity Resolution**: Canonicalizes names, groups aliases, avoids cross-type collisions.
4. **Relationship Extraction**: Extracts explicit predicates (`IMPLEMENTS`, `USES`, `DEPENDS_ON`, `RUNS_ON`, `PART_OF`).
5. **Evidence Linking**: Creates immutable `Evidence` record linking chunk ID and snippet.

## Incremental Updates & Document Deletions

- When a document is re-ingested or deleted (`deleteDocument(docId)`):
  1. Mentions associated with `docId` are deleted.
  2. Evidence backed by `docId` is removed.
  3. Relationships referencing solely deleted evidence are pruned to prevent orphaned edges.
  4. Entities with remaining mentions in other documents are preserved.

## Source Files

- Ingestion Pipeline: [`packages/graph/src/pipeline/ingestion.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/pipeline/ingestion.ts)
- Base Extractors: [`packages/graph/src/extractors/base.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/extractors/base.ts)
- Rule Extractor: [`packages/graph/src/extractors/rule-based.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/extractors/rule-based.ts)
