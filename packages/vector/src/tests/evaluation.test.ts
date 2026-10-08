import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { performance } from "node:perf_hooks";
import { VectorEngine } from "../engine/engine.js";
import { FileSystemStorageBackend } from "../storage/fs.storage.js";

const EVALUATION_CORPUS = [
  {
    id: "doc_consensus",
    text: "Distributed consensus algorithms such as Paxos and Raft ensure fault tolerance, leader election, and log replication across untrusted network nodes.",
  },
  {
    id: "doc_quantum",
    text: "Quantum computing leverages quantum mechanical phenomena including qubit superposition and entanglement to execute quantum Fourier transforms and Shor algorithms.",
  },
  {
    id: "doc_compiler",
    text: "Modern optimizing compilers transform AST into Static Single Assignment SSA form, performing dead code elimination, loop vectorization, and register allocation.",
  },
  {
    id: "doc_rust_safety",
    text: "Memory safety without garbage collection is achieved through ownership rules, borrow checking, and compile-time lifetime annotations in systems languages.",
  },
  {
    id: "doc_zkp",
    text: "Zero-knowledge proofs including zk-SNARKs and zk-STARKs allow a prover to mathematically demonstrate knowledge of a secret statement without revealing the secret itself.",
  },
  {
    id: "doc_rdbms",
    text: "Relational database engines provide ACID transaction guarantees using write-ahead logs, B-tree indexes, and cost-based query optimization planners.",
  },
  {
    id: "doc_neural_net",
    text: "Deep neural networks learn representations by calculating loss gradients through backpropagation and updating weight matrices with stochastic gradient descent.",
  },
  {
    id: "doc_service_mesh",
    text: "Cloud native service meshes utilize Envoy sidecars, mutual TLS mTLS, and dynamic control planes for traffic splitting and telemetry observation.",
  },
  {
    id: "doc_browser_sandbox",
    text: "Web browser engines isolate untrusted JavaScript execution through multi-process architecture, site isolation, and restricted operating system sandboxes.",
  },
  {
    id: "doc_asym_crypto",
    text: "Asymmetric public key cryptography relies on computationally hard problems like integer factorization and discrete logarithms over elliptic curves.",
  },
];

const EVALUATION_QUERIES = [
  { query: "paxos raft Byzantine fault tolerance replication", expectedId: "doc_consensus" },
  { query: "qubit superposition entanglement quantum computing", expectedId: "doc_quantum" },
  { query: "compiler optimization SSA register allocation", expectedId: "doc_compiler" },
  { query: "borrow checker ownership lifetime memory safety", expectedId: "doc_rust_safety" },
  { query: "zk-SNARK mathematical zero-knowledge proof statement", expectedId: "doc_zkp" },
  { query: "relational database ACID transaction write-ahead log", expectedId: "doc_rdbms" },
  { query: "gradient descent backpropagation neural network loss", expectedId: "doc_neural_net" },
  { query: "service mesh envoy mutual TLS traffic splitting", expectedId: "doc_service_mesh" },
  {
    query: "browser JavaScript site isolation sandbox architecture",
    expectedId: "doc_browser_sandbox",
  },
  { query: "elliptic curve asymmetric public key cryptography", expectedId: "doc_asym_crypto" },
];

test("Retrieval Quality Evaluation: measures Recall@K, Precision@K, MRR, and Latency on controlled corpus", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_eval_${Date.now()}`);
  const engine = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await engine.init();

  await engine.createCollection({ name: "eval_collection", dimension: 64 });

  // Index corpus
  await engine.batchInsert(
    "eval_collection",
    EVALUATION_CORPUS.map((c) => ({
      id: c.id,
      text: c.text,
    }))
  );

  const topK = 3;
  let recallHits = 0;
  let reciprocalRankSum = 0;
  const latencies: number[] = [];

  for (const item of EVALUATION_QUERIES) {
    const t0 = performance.now();
    const response = await engine.search({
      collection: "eval_collection",
      query: item.query,
      mode: "hybrid",
      top_k: topK,
    });
    const dur = performance.now() - t0;
    latencies.push(dur);

    const rankIdx = response.results.findIndex((r) => r.id === item.expectedId);
    if (rankIdx !== -1) {
      recallHits++;
      reciprocalRankSum += 1 / (rankIdx + 1);
    }
  }

  const numQueries = EVALUATION_QUERIES.length;
  const recallAtK = recallHits / numQueries;
  const precisionAtK = recallHits / (numQueries * topK);
  const mrr = reciprocalRankSum / numQueries;
  const avgLatencyMs = Number((latencies.reduce((a, b) => a + b, 0) / numQueries).toFixed(3));

  console.log(`\n=== Retrieval Quality Evaluation Results ===`);
  console.log(`Corpus Size:      ${EVALUATION_CORPUS.length} documents`);
  console.log(`Queries Evaluated:${numQueries}`);
  console.log(`Recall@${topK}:        ${(recallAtK * 100).toFixed(1)}%`);
  console.log(`Precision@${topK}:     ${(precisionAtK * 100).toFixed(1)}%`);
  console.log(`MRR:              ${mrr.toFixed(3)}`);
  console.log(`Avg Latency:      ${avgLatencyMs} ms`);

  // Assert realistic benchmark expectations
  assert.ok(recallAtK >= 0.8, `Recall@${topK} must be >= 0.8 (actual: ${recallAtK})`);
  assert.ok(mrr >= 0.7, `MRR must be >= 0.7 (actual: ${mrr})`);
  assert.ok(avgLatencyMs < 50, `Average latency must be < 50ms (actual: ${avgLatencyMs}ms)`);

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});
