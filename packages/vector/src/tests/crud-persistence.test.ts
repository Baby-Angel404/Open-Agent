import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { VectorEngine } from "../engine/engine.js";
import {
  FileSystemStorageBackend,
  CorruptedStorageError,
  IncompatibleSchemaVersionError,
} from "../storage/fs.storage.js";

test("CRUD: insert, get, update, delete, and batch operations", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_crud_${Date.now()}`);
  const engine = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await engine.init();

  await engine.createCollection({ name: "crud_col", dimension: 2 });

  // 1. Insert & Get
  const rec = await engine.insert("crud_col", {
    id: "r1",
    vector: [1.0, 2.0],
    text: "Initial text",
    metadata: { version: 1 },
  });
  assert.strictEqual(rec.id, "r1");
  assert.strictEqual(engine.getRecord("crud_col", "r1")?.text, "Initial text");

  // 2. Update
  const updated = await engine.updateRecord("crud_col", "r1", {
    text: "Updated text",
    metadata: { version: 2 },
  });
  assert.strictEqual(updated.text, "Updated text");
  assert.strictEqual(engine.getRecord("crud_col", "r1")?.metadata?.version, 2);

  // 3. Batch Insert
  await engine.batchInsert("crud_col", [
    { id: "r2", vector: [2.0, 3.0], text: "Doc 2" },
    { id: "r3", vector: [3.0, 4.0], text: "Doc 3" },
  ]);
  assert.strictEqual(engine.getCollection("crud_col")?.record_count, 3);

  // 4. Delete & Batch Delete
  const deleted1 = await engine.deleteRecord("crud_col", "r1");
  assert.strictEqual(deleted1, true);
  assert.strictEqual(engine.getRecord("crud_col", "r1"), undefined);

  const batchDelCount = await engine.batchDelete("crud_col", ["r2", "r3"]);
  assert.strictEqual(batchDelCount, 2);
  assert.strictEqual(engine.getCollection("crud_col")?.record_count, 0);

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Persistence: data survives engine shutdown and clean restart", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_persist_${Date.now()}`);

  // Engine instance 1
  const engine1 = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await engine1.init();
  await engine1.createCollection({ name: "persist_col", dimension: 3 });
  await engine1.batchInsert("persist_col", [
    { id: "p1", vector: [1, 0, 0], text: "First durable record" },
    { id: "p2", vector: [0, 1, 0], text: "Second durable record" },
  ]);
  await engine1.close();

  // Engine instance 2 (simulating fresh process restart)
  const engine2 = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await engine2.init();

  const col = engine2.getCollection("persist_col");
  assert.ok(col);
  assert.strictEqual(col.dimension, 3);
  assert.strictEqual(col.record_count, 2);

  const res = await engine2.search({
    collection: "persist_col",
    vector: [1, 0, 0],
    mode: "dense",
  });
  assert.strictEqual(res.results.length, 2);
  assert.strictEqual(res.results[0].id, "p1");

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Persistence: detects corrupted storage files and fails closed", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_corrupt_${Date.now()}`);
  const storage = new FileSystemStorageBackend(tmpDir);
  const engine = new VectorEngine({ storage });
  await engine.init();

  await engine.createCollection({ name: "safe_col", dimension: 2 });
  await engine.insert("safe_col", { id: "s1", vector: [1, 2] });

  // Intentionally corrupt records.jsonl with malformed non-JSON bytes
  const recordsPath = path.join(tmpDir, "collections", "safe_col", "records.jsonl");
  fs.writeFileSync(recordsPath, "CORRUPTED_TRUNCATED_GARBAGE\n{bad_json", "utf-8");

  const corruptEngine = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await assert.rejects(
    async () => {
      await corruptEngine.init();
    },
    (err: Error) => {
      assert.ok(err instanceof CorruptedStorageError);
      assert.match(err.message, /Corrupted record/);
      return true;
    }
  );

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Persistence: detects incompatible schema version", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_version_${Date.now()}`);
  const manifestPath = path.join(tmpDir, "manifest.json");

  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      version: "99.0.0", // Incompatible future major version
      collections: [],
    }),
    "utf-8"
  );

  const engine = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await assert.rejects(
    async () => {
      await engine.init();
    },
    (err: Error) => {
      assert.ok(err instanceof IncompatibleSchemaVersionError);
      assert.match(err.message, /Incompatible storage schema version/);
      return true;
    }
  );

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});
