# OpenAgent Vector Storage Architecture

## 1. Storage Abstraction

All vector storage is isolated behind the `IStorageBackend` interface, allowing pluggable storage engines without modifying index or retrieval code:

```typescript
export interface IStorageBackend {
  saveManifest(manifest: StorageManifest): Promise<void>;
  loadManifest(): Promise<StorageManifest | null>;
  saveCollectionRecords(collectionId: string, records: VectorRecord[]): Promise<void>;
  loadCollectionRecords(collectionId: string): Promise<VectorRecord[]>;
  deleteCollection(collectionId: string): Promise<void>;
  close(): Promise<void>;
}
```

---

## 2. FileSystem Storage Implementation

`FileSystemStorageBackend` persists collections to a local directory (default: `.vector-store/`):

```
.vector-store/
├── manifest.json                  # Collection catalog & schema metadata
└── collections/
    ├── kb_docs.json               # Records for 'kb_docs' collection
    └── agent_memory.json          # Records for 'agent_memory' collection
```

### Schema Manifest Format (`manifest.json`)

```json
{
  "version": "1.0.0",
  "created_at": "2026-10-08T00:00:00.000Z",
  "updated_at": "2026-10-08T00:01:00.000Z",
  "collections": [
    {
      "collection_id": "kb_docs",
      "name": "Knowledge Base",
      "dimension": 64,
      "metric": "cosine",
      "created_at": "2026-10-08T00:00:00.000Z"
    }
  ]
}
```

---

## 3. Corruption Detection & Atomic Persistence

1. **Atomic Writes via Temp File & Rename**:
   Writes do not modify production JSON files directly. Data is serialized and written to `${targetPath}.tmp.${Date.now()}` followed by an atomic `fs.renameSync` replace operation. This prevents incomplete state upon sudden process termination.

2. **Schema Compatibility**:
   The engine checks `version` on startup. If an incompatible major schema is loaded, `IncompatibleSchemaVersionError` is thrown.

3. **Corruption Detection**:
   If a collection file fails JSON parse validation or contains malformed record structures, a structured `CorruptedStorageError` is thrown detailing the offending path and failure point.
