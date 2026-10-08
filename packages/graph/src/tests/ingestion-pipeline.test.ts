import test from "node:test";
import assert from "node:assert";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { FileSystemGraphStorage } from "../storage/graph-storage.js";
import { GraphIngestionPipeline } from "../pipeline/ingestion.js";

test("GraphIngestionPipeline processes documents with full provenance and incremental updates", async () => {
  const tmpDir = path.join(os.tmpdir(), `graph_ingest_test_${Date.now()}`);
  const storage = new FileSystemGraphStorage(tmpDir);
  const pipeline = new GraphIngestionPipeline({ storage });

  const doc1 = {
    id: "doc_rust_intro",
    text: "Rust is used to build Systems Programming applications. Rust is developed by OpenAgent.",
    source: "https://example.com/rust.md",
  };

  // 1. Initial Ingestion
  const res1 = await pipeline.ingest(doc1);
  assert.strictEqual(res1.document_id, "doc_rust_intro");
  assert.ok(res1.chunks_count >= 1);
  assert.ok(res1.entities_created >= 2);
  assert.ok(res1.relationships_created >= 1);
  assert.ok(res1.evidence_created >= 1);

  // Verify entities and relations stored
  const rustEntity = storage.findEntities({ nameQuery: "Rust" })[0];
  assert.ok(rustEntity);
  assert.strictEqual(rustEntity.entity_type, "TECHNOLOGY");

  const rels = storage.getOutboundRelationships(rustEntity.entity_id);
  assert.ok(rels.length >= 1);
  assert.strictEqual(rels[0].evidence_ids.length >= 1, true);

  // Verify evidence
  const ev = storage.getEvidence(rels[0].evidence_ids[0]);
  assert.ok(ev);
  assert.strictEqual(ev.document_id, "doc_rust_intro");
  assert.ok(ev.source_text_reference.includes("Rust"));

  // 2. Incremental Update: Re-ingest modified doc
  const doc1Updated = {
    id: "doc_rust_intro",
    text: "Rust is used to build Systems Programming applications.",
    source: "https://example.com/rust.md",
  };

  const res2 = await pipeline.ingest(doc1Updated);
  assert.strictEqual(res2.document_id, "doc_rust_intro");

  // Should have updated cleanly without duplicating relationships
  const relsAfter = storage.getOutboundRelationships(rustEntity.entity_id);
  const duplicates = relsAfter.filter((r) => r.predicate === "USED_FOR");
  assert.strictEqual(duplicates.length, 1);

  // 3. Document Deletion
  const delRes = await pipeline.deleteDocument("doc_rust_intro");
  assert.strictEqual(delRes.document_id, "doc_rust_intro");
  assert.ok(delRes.evidence_removed >= 1);
  assert.ok(delRes.relationships_removed >= 1);

  // Evidence and dependent relationships should be gone
  assert.strictEqual(storage.listEvidence().length, 0);
  assert.strictEqual(storage.listRelationships().length, 0);

  // Shared entity remains preserved in knowledge graph
  assert.strictEqual(storage.getEntity(rustEntity.entity_id)?.canonical_name, "Rust");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
