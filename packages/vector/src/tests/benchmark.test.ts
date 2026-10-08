import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { performance } from "node:perf_hooks";
import { VectorEngine } from "../engine/engine.js";
import { FileSystemStorageBackend } from "../storage/fs.storage.js";
import { InsertRecordInput } from "../types/index.js";

test("Performance Benchmark: 1K record insertion and hybrid search throughput", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_bench_${Date.now()}`);
  const engine = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await engine.init();

  const dimension = 32;
  await engine.createCollection({ name: "bench_col", dimension });

  const numRecords = 1000;
  const sampleBatch: InsertRecordInput[] = [];

  for (let i = 0; i < numRecords; i++) {
    const vec: number[] = new Array(dimension);
    for (let d = 0; d < dimension; d++) {
      vec[d] = Math.sin(i * 13 + d);
    }
    sampleBatch.push({
      id: `bench_rec_${i}`,
      vector: vec,
      text: `Benchmark record index ${i} with topic keywords ${i % 10 === 0 ? "critical priority" : "standard entry"}`,
      metadata: { index: i, even: i % 2 === 0 },
    });
  }

  // 1. Measure Batch Insertion
  const tInsertStart = performance.now();
  await engine.batchInsert("bench_col", sampleBatch);
  const insertDurationMs = performance.now() - tInsertStart;
  const insertRate = Math.round((numRecords / insertDurationMs) * 1000);

  // 2. Measure Search Latency (Dense, Sparse, Hybrid)
  const queryVec = new Array(dimension).fill(0.5);

  const tDense = performance.now();
  const denseRes = await engine.search({
    collection: "bench_col",
    vector: queryVec,
    mode: "dense",
    top_k: 10,
  });
  const denseLatencyMs = performance.now() - tDense;

  const tSparse = performance.now();
  const sparseRes = await engine.search({
    collection: "bench_col",
    query: "critical priority",
    mode: "sparse",
    top_k: 10,
  });
  const sparseLatencyMs = performance.now() - tSparse;

  const tHybrid = performance.now();
  const hybridRes = await engine.search({
    collection: "bench_col",
    vector: queryVec,
    query: "critical priority",
    mode: "hybrid",
    top_k: 10,
  });
  const hybridLatencyMs = performance.now() - tHybrid;

  const mem = process.memoryUsage();
  const memMb = Number((mem.rss / 1024 / 1024).toFixed(2));

  console.log(`\n=== Vector Engine Performance Benchmark ===`);
  console.log(`Platform:         ${process.platform} (${process.arch})`);
  console.log(`Node Version:     ${process.version}`);
  console.log(`Dataset Size:     ${numRecords} records (dim=${dimension})`);
  console.log(`Insert Duration:  ${insertDurationMs.toFixed(2)} ms (${insertRate} records/sec)`);
  console.log(
    `Dense Latency:    ${denseLatencyMs.toFixed(3)} ms (found: ${denseRes.results.length})`
  );
  console.log(
    `Sparse Latency:   ${sparseLatencyMs.toFixed(3)} ms (found: ${sparseRes.results.length})`
  );
  console.log(
    `Hybrid Latency:   ${hybridLatencyMs.toFixed(3)} ms (found: ${hybridRes.results.length})`
  );
  console.log(`Memory Usage:     ${memMb} MB RSS`);

  assert.ok(
    insertRate > 500,
    `Insertion throughput should be > 500 records/sec (actual: ${insertRate})`
  );
  assert.ok(
    hybridLatencyMs < 100,
    `Hybrid search latency should be < 100ms (actual: ${hybridLatencyMs}ms)`
  );
  assert.strictEqual(denseRes.results.length, 10);
  assert.ok(sparseRes.results.length > 0);
  assert.strictEqual(hybridRes.results.length, 10);

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});
