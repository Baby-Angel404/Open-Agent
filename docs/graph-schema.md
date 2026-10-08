# Knowledge Graph Schema Specification

Schema version: `1.0.0` (validated upon load; incompatible schemas throw `IncompatibleGraphSchemaError`).

## Core Data Models

### 1. Entity

Represents an extracted or canonicalized concept, product, technology, or person.

```typescript
interface Entity {
  entity_id: string; // Deterministic ID (e.g. ent_technology_rust)
  canonical_name: string; // Canonical human-readable label
  entity_type: EntityType; // PERSON, ORG, PRODUCT, CONCEPT, TECHNOLOGY, etc.
  aliases: string[]; // Synonyms and alternative surface forms
  description?: string; // Optional description
  metadata?: Record<string, unknown>;
  created_at: string; // ISO-8601 timestamp
  updated_at: string;
}
```

### 2. EntityMention

Locates where an entity surface form appears in raw text.

```typescript
interface EntityMention {
  mention_id: string; // UUID
  entity_id: string; // Target canonical entity ID
  document_id: string; // Parent document ID
  chunk_id: string; // Vector chunk ID
  text: string; // Exact surface text matched
  start_offset: number; // Character start offset
  end_offset: number; // Character end offset
  confidence: number; // Extraction score [0.0 - 1.0]
}
```

### 3. Relationship

Represents a directed typed edge between two entities.

```typescript
interface Relationship {
  relationship_id: string; // Deterministic ID
  subject_entity_id: string; // Source entity
  predicate: string; // Verb/predicate (e.g. IMPLEMENTS, USES, CONTAINS)
  object_entity_id: string; // Target entity
  confidence: number; // Combined relationship confidence [0.0 - 1.0]
  evidence_ids: string[]; // Required backing Evidence IDs
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

### 4. Evidence

Immutable citation link grounding assertions in document chunks.

```typescript
interface Evidence {
  evidence_id: string; // SHA-256 derived or UUID
  document_id: string; // Source document
  chunk_id: string; // Source chunk
  source_text_reference: string; // Verifiable snippet / excerpt
  extraction_method: ExtractionMethod; // RULE_BASED, MODEL_BASED, MANUAL
  confidence: number;
  created_at: string;
}
```

## Storage Layout

- Manifest: `<basePath>/manifest.json` containing counts and schema version.
- Graph Data: `<basePath>/graph-data.json` written atomically via temp file rename.

## Source Files

- Schema definitions: [`packages/graph/src/types/index.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/types/index.ts)
- Storage Engine: [`packages/graph/src/storage/graph-storage.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/storage/graph-storage.ts)
