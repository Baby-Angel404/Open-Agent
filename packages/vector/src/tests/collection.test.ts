import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { VectorEngine } from "../engine/engine.js";
import { FileSystemStorageBackend } from "../storage/fs.storage.js";
import { DimensionMismatchError } from "../index/distance.js";

test("Collection: create, list, get, and delete operations", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_col_${Date.now()}`);
  const storage = new FileSystemStorageBackend(tmpDir);
  const engine = new VectorEngine({ storage });
  await engine.init();

  // Create
  const col1 = await engine.createCollection({
    name: "research_papers",
    dimension: 64,
    metric: "cosine",
  });

  assert.strictEqual(col1.name, "research_papers");
  assert.strictEqual(col1.dimension, 64);
  assert.strictEqual(col1.metric, "cosine");

  // Duplicate name/id throws error
  await assert.rejects(async () => {
    await engine.createCollection({ name: "research_papers", dimension: 64 });
  }, /already exists/);

  // Get
  const fetched = engine.getCollection("research_papers");
  assert.ok(fetched);
  assert.strictEqual(fetched.dimension, 64);

  // List
  const list = engine.listCollections();
  assert.strictEqual(list.length, 1);

  // Delete
  const deleted = await engine.deleteCollection("research_papers");
  assert.strictEqual(deleted, true);
  assert.strictEqual(engine.listCollections().length, 0);

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Collection: strictly validates vector dimensions and prevents mixing incompatible dimensions", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_dim_${Date.now()}`);
  const engine = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await engine.init();

  await engine.createCollection({
    name: "dim_3_test",
    dimension: 3,
  });

  // Valid 3-dimensional vector
  await engine.insert("dim_3_test", {
    id: "r1",
    vector: [0.1, 0.2, 0.3],
  });

  // Incompatible 4-dimensional vector must reject
  await assert.rejects(
    async () => {
      await engine.insert("dim_3_test", {
        id: "r2",
        vector: [0.1, 0.2, 0.3, 0.4],
      });
    },
    (err: Error) => {
      assert.ok(
        err instanceof DimensionMismatchError || err.message.includes("dimension mismatch")
      );
      return true;
    }
  );

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Collection: guarantees strict collection isolation", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_iso_${Date.now()}`);
  const engine = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await engine.init();

  await engine.createCollection({ name: "col_a", dimension: 4 });
  await engine.createCollection({ name: "col_b", dimension: 4 });

  await engine.insert("col_a", { id: "doc_a", vector: [1, 0, 0, 0], text: "Alpha content" });
  await engine.insert("col_b", { id: "doc_b", vector: [0, 1, 0, 0], text: "Beta content" });

  const resA = await engine.search({ collection: "col_a", query: "content" });
  const resB = await engine.search({ collection: "col_b", query: "content" });

  assert.strictEqual(resA.results.length, 1);
  assert.strictEqual(resA.results[0].id, "doc_a");

  assert.strictEqual(resB.results.length, 1);
  assert.strictEqual(resB.results[0].id, "doc_b");

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});
