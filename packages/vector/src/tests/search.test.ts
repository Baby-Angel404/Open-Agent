import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { VectorEngine } from "../engine/engine.js";
import { FileSystemStorageBackend } from "../storage/fs.storage.js";

test("Search: dense vector search returns ordered similarity scores", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_dense_${Date.now()}`);
  const engine = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await engine.init();

  await engine.createCollection({ name: "dense_col", dimension: 3, metric: "cosine" });

  await engine.insert("dense_col", { id: "d1", vector: [1, 0, 0], text: "Exact match" });
  await engine.insert("dense_col", { id: "d2", vector: [0.7, 0.7, 0], text: "Partial match" });
  await engine.insert("dense_col", { id: "d3", vector: [0, 1, 0], text: "Orthogonal vector" });

  const res = await engine.search({
    collection: "dense_col",
    vector: [1, 0, 0],
    mode: "dense",
    top_k: 2,
  });

  assert.strictEqual(res.results.length, 2);
  assert.strictEqual(res.results[0].id, "d1");
  assert.strictEqual(Math.round(res.results[0].score), 1);
  assert.strictEqual(res.results[1].id, "d2");

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Search: BM25 sparse keyword search ranks matching terms", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_sparse_${Date.now()}`);
  const engine = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await engine.init();

  await engine.createCollection({ name: "sparse_col", dimension: 4 });

  await engine.insert("sparse_col", {
    id: "s1",
    vector: [0.1, 0.1, 0.1, 0.1],
    text: "Quantum cryptography and quantum computing principles",
  });
  await engine.insert("sparse_col", {
    id: "s2",
    vector: [0.1, 0.1, 0.1, 0.1],
    text: "Classical distributed systems and consensus protocols",
  });

  const res = await engine.search({
    collection: "sparse_col",
    query: "quantum computing",
    mode: "sparse",
    top_k: 5,
  });

  assert.ok(res.results.length >= 1);
  assert.strictEqual(res.results[0].id, "s1");
  assert.ok(res.results[0].score > 0);

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Search: hybrid search merges dense and sparse candidates with configurable weights", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_hybrid_${Date.now()}`);
  const engine = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await engine.init();

  await engine.createCollection({ name: "hybrid_col", dimension: 4 });

  await engine.insert("hybrid_col", {
    id: "h1",
    vector: [0.9, 0.1, 0, 0],
    text: "Neural network backpropagation algorithms",
  });
  await engine.insert("hybrid_col", {
    id: "h2",
    vector: [0.1, 0.9, 0, 0],
    text: "High-performance vector databases in Rust",
  });

  const res = await engine.search({
    collection: "hybrid_col",
    query: "vector databases Rust",
    vector: [0.1, 0.9, 0, 0],
    mode: "hybrid",
    dense_weight: 0.5,
    sparse_weight: 0.5,
    top_k: 2,
  });

  assert.strictEqual(res.results.length, 2);
  assert.strictEqual(res.results[0].id, "h2");
  assert.ok(res.results[0].dense_score !== undefined);
  assert.ok(res.results[0].sparse_score !== undefined);

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Search: metadata filtering supports equality, range, and inclusion", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_filt_${Date.now()}`);
  const engine = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await engine.init();

  await engine.createCollection({ name: "filt_col", dimension: 4 });

  await engine.batchInsert("filt_col", [
    {
      id: "f1",
      vector: [1, 0, 0, 0],
      text: "Machine learning report",
      metadata: { year: 2024, language: "en", tags: ["ai", "ml"] },
    },
    {
      id: "f2",
      vector: [0.9, 0.1, 0, 0],
      text: "Laporan kecerdasan buatan",
      metadata: { year: 2026, language: "id", tags: ["ai"] },
    },
    {
      id: "f3",
      vector: [0.8, 0.2, 0, 0],
      text: "Database design notes",
      metadata: { year: 2025, language: "en", tags: ["db"] },
    },
  ]);

  // Filter 1: language = 'id'
  const r1 = await engine.search({
    collection: "filt_col",
    vector: [1, 0, 0, 0],
    mode: "dense",
    filter: { language: "id" },
  });
  assert.strictEqual(r1.results.length, 1);
  assert.strictEqual(r1.results[0].id, "f2");

  // Filter 2: year >= 2025
  const r2 = await engine.search({
    collection: "filt_col",
    vector: [1, 0, 0, 0],
    mode: "dense",
    filter: { year: { gte: 2025 } },
  });
  assert.strictEqual(r2.results.length, 2);
  const ids = r2.results.map((r) => r.id);
  assert.ok(ids.includes("f2"));
  assert.ok(ids.includes("f3"));
  assert.ok(!ids.includes("f1"));

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});
