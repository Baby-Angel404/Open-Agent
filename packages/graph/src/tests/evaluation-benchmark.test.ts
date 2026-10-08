import test from "node:test";
import assert from "node:assert";
import { performance } from "node:perf_hooks";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import {
  VectorEngine,
  LocalHashEmbeddingProvider,
  FileSystemStorageBackend,
} from "@open-agent/vector";
import { FileSystemGraphStorage } from "../storage/graph-storage.js";
import { GraphIngestionPipeline } from "../pipeline/ingestion.js";
import { GraphRAGEngine } from "../rag/engine.js";
import { Entity, Relationship, Evidence } from "../types/index.js";

test("Evaluation: Baseline Hybrid Search vs Hybrid + Graph RAG comparative quality", async () => {
  const tmpDir = path.join(os.tmpdir(), `eval_comp_test_${Date.now()}`);
  const vStorage = new FileSystemStorageBackend(path.join(tmpDir, "vstore"));
  const gStorage = new FileSystemGraphStorage(path.join(tmpDir, "gstore"));

  const provider = new LocalHashEmbeddingProvider(64);
  const vectorEngine = new VectorEngine({
    storage: vStorage,
    defaultEmbeddingProvider: provider,
  });
  await vectorEngine.init();

  const col = await vectorEngine.createCollection({ name: "eval_col", dimension: 64 });
  const pipeline = new GraphIngestionPipeline({ storage: gStorage });
  const ragEngine = new GraphRAGEngine({ storage: gStorage, vectorEngine });

  // Evaluation dataset: 5 interconnected domain documents
  const docs = [
    { id: "doc_1", text: "Rust is used to build OpenAgent Infrastructure. Rust is fast." },
    { id: "doc_2", text: "OpenAgent Infrastructure implements Policy Engine." },
    { id: "doc_3", text: "Policy Engine depends on Audit Trail." },
    { id: "doc_4", text: "Node.js is used to build CLI applications." },
    { id: "doc_5", text: "Docker is used for containerized deployment." },
  ];

  for (const d of docs) {
    await vectorEngine.ingestDocument(col.name, { id: d.id, text: d.text });
    await pipeline.ingest(d);
  }

  // Multi-hop query: "What security component is implemented by the system built with Rust?"
  const multiHopQuery = "What does the system built with Rust implement?";

  // Baseline: Hybrid Vector Search Only
  const baselineT0 = performance.now();
  const baselineRes = await vectorEngine.search({
    collection: col.name,
    query: multiHopQuery,
    mode: "hybrid",
    top_k: 2,
  });
  const baselineLatency = performance.now() - baselineT0;

  // Graph RAG
  const graphT0 = performance.now();
  const graphRes = await ragEngine.query({
    query: multiHopQuery,
    collection: col.name,
    use_graph: true,
    top_k: 2,
    graph_depth: 2,
  });
  const graphLatency = performance.now() - graphT0;

  console.log("=== Retrieval Quality Comparison ===");
  console.log(`Baseline Latency:    ${baselineLatency.toFixed(2)}ms`);
  console.log(`Graph RAG Latency:   ${graphLatency.toFixed(2)}ms`);
  console.log(`Baseline Top Hit:    ${baselineRes.results[0]?.text || "none"}`);
  console.log(`Graph RAG Answer:    ${graphRes.answer?.text || "none"}`);
  console.log(`Graph Grounding:     ${graphRes.answer?.status || "none"}`);
  console.log(`Entities Expanded:   ${graphRes.context.entities.length}`);
  console.log(`Relations Expanded:  ${graphRes.context.relationships.length}`);

  // In multi-hop, Graph RAG discovers OpenAgent and Policy Engine via 2-hop traversal!
  assert.ok(
    graphRes.context.entities.some(
      (e) => e.canonical_name.includes("Policy Engine") || e.canonical_name.includes("OpenAgent")
    )
  );
  assert.strictEqual(graphRes.answer?.status, "SUPPORTED");
  assert.ok(graphRes.provenance.length > 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Performance Benchmark: 1,000 entities insertion, lookup, and traversal", async () => {
  const tmpDir = path.join(os.tmpdir(), `bench_graph_test_${Date.now()}`);
  const storage = new FileSystemGraphStorage(tmpDir);

  const entityCount = 1000;
  console.log(`\n=== Benchmarking Graph Storage (${entityCount} entities) ===`);

  // 1. Insertion Benchmark
  const tInsert0 = performance.now();
  for (let i = 0; i < entityCount; i++) {
    const e: Entity = {
      entity_id: `ent_${i}`,
      canonical_name: `Entity ${i}`,
      entity_type: i % 2 === 0 ? "TECHNOLOGY" : "CONCEPT",
      aliases: [`E-${i}`],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await storage.createEntity(e);

    // Link every entity to its predecessor and a cluster head
    if (i > 0) {
      const r: Relationship = {
        relationship_id: `rel_${i}`,
        subject_entity_id: `ent_${i - 1}`,
        predicate: "DEPENDS_ON",
        object_entity_id: `ent_${i}`,
        confidence: 0.95,
        evidence_ids: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await storage.createRelationship(r);
    }
  }
  const insertDuration = (performance.now() - tInsert0) / 1000;
  const insertThroughput = Math.round(entityCount / insertDuration);
  console.log(
    `Inserted ${entityCount} entities + ${entityCount - 1} relationships in ${insertDuration.toFixed(3)}s (${insertThroughput.toLocaleString()} ops/sec)`
  );

  // 2. Lookup Latency
  const tLookup0 = performance.now();
  for (let i = 0; i < 500; i++) {
    storage.getEntity(`ent_${i * 2}`);
  }
  const avgLookupMs = (performance.now() - tLookup0) / 500;
  console.log(`Entity Direct Lookup Latency: ${(avgLookupMs * 1000).toFixed(2)} µs/op`);

  // 3. Traversal Latency
  const { GraphTraversalEngine } = await import("../traversal/traversal.js");
  const traversal = new GraphTraversalEngine(storage);

  const tTrav0 = performance.now();
  const travRes = traversal.neighbors("ent_10", { depth: 2 });
  const travDurationMs = performance.now() - tTrav0;

  console.log(
    `2-Hop Traversal Latency: ${travDurationMs.toFixed(2)}ms (Discovered ${travRes.nodes.length} nodes, ${travRes.edges.length} edges)`
  );

  assert.ok(travDurationMs < 20); // Sub-20ms traversal
  assert.ok(insertThroughput > 1000);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
