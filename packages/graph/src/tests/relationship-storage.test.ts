import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { FileSystemGraphStorage, CorruptedGraphStorageError } from "../storage/graph-storage.js";
import { Entity, Relationship, Evidence } from "../types/index.js";

test("FileSystemGraphStorage CRUD and adjacency index integrity", async () => {
  const tmpDir = path.join(os.tmpdir(), `graph_storage_test_${Date.now()}`);
  const storage = new FileSystemGraphStorage(tmpDir);

  const e1: Entity = {
    entity_id: "ent_rust",
    canonical_name: "Rust",
    entity_type: "TECHNOLOGY",
    aliases: ["Rust-lang"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const e2: Entity = {
    entity_id: "ent_systems_programming",
    canonical_name: "Systems Programming",
    entity_type: "CONCEPT",
    aliases: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await storage.createEntity(e1);
  await storage.createEntity(e2);

  assert.strictEqual(storage.listEntities().length, 2);
  assert.strictEqual(storage.getEntity("ent_rust")?.canonical_name, "Rust");

  // Evidence
  const ev1: Evidence = {
    evidence_id: "ev_001",
    document_id: "doc_01",
    chunk_id: "chk_01",
    source_text_reference: "Rust is used for Systems Programming.",
    extraction_method: "RULE_BASED",
    confidence: 0.95,
    created_at: new Date().toISOString(),
  };
  await storage.createEvidence(ev1);

  // Relationship
  const rel1: Relationship = {
    relationship_id: "rel_001",
    subject_entity_id: "ent_rust",
    predicate: "USED_FOR",
    object_entity_id: "ent_systems_programming",
    confidence: 0.95,
    evidence_ids: ["ev_001"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await storage.createRelationship(rel1);

  // Adjacency tests
  const out = storage.getOutboundRelationships("ent_rust");
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].predicate, "USED_FOR");

  const inB = storage.getInboundRelationships("ent_systems_programming");
  assert.strictEqual(inB.length, 1);
  assert.strictEqual(inB[0].subject_entity_id, "ent_rust");

  // Persist to disk
  await storage.save();

  // Test reload on fresh instance (survives restart)
  const reloaded = new FileSystemGraphStorage(tmpDir);
  await reloaded.load();

  assert.strictEqual(reloaded.listEntities().length, 2);
  assert.strictEqual(reloaded.listRelationships().length, 1);
  assert.strictEqual(reloaded.getOutboundRelationships("ent_rust").length, 1);
  assert.strictEqual(reloaded.getEvidence("ev_001")?.confidence, 0.95);

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("FileSystemGraphStorage detects corrupted data gracefully", async () => {
  const tmpDir = path.join(os.tmpdir(), `graph_corrupt_test_${Date.now()}`);
  const storage = new FileSystemGraphStorage(tmpDir);

  await storage.createEntity({
    entity_id: "ent_a",
    canonical_name: "Alpha",
    entity_type: "CONCEPT",
    aliases: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  await storage.save();

  // Tamper with data file
  fs.writeFileSync(path.join(tmpDir, "graph-data.json"), "MALFORMED_NON_JSON_CONTENT{{{");

  const fresh = new FileSystemGraphStorage(tmpDir);
  await assert.rejects(async () => {
    await fresh.load();
  }, CorruptedGraphStorageError);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
