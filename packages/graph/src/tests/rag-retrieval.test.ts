import test from "node:test";
import assert from "node:assert";
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
import { GraphRanker } from "../rag/ranker.js";

test("GraphRanker boosts candidates by graph proximity and evidence", () => {
  const ranker = new GraphRanker({ vectorWeight: 0.4, sparseWeight: 0.2, graphWeight: 0.4 });

  const scoreNear = ranker.scoreCandidate({
    passage: { chunk_id: "c1", document_id: "d1", text: "Rust is fast", score: 0.5 },
    vectorScore: 0.5,
    sparseScore: 0.5,
    graphDistance: 0, // Direct query entity mention
    matchedEntities: [],
    matchedRelationships: [],
    supportingEvidence: [
      {
        evidence_id: "ev1",
        document_id: "d1",
        chunk_id: "c1",
        source_text_reference: "Rust is fast",
        extraction_method: "RULE_BASED",
        confidence: 0.9,
        created_at: new Date().toISOString(),
      },
    ],
  });

  const scoreFar = ranker.scoreCandidate({
    passage: { chunk_id: "c2", document_id: "d2", text: "Unrelated text", score: 0.5 },
    vectorScore: 0.5,
    sparseScore: 0.5,
    graphDistance: 999, // Unlinked
    matchedEntities: [],
    matchedRelationships: [],
    supportingEvidence: [],
  });

  assert.ok(
    scoreNear > scoreFar,
    `Near score (${scoreNear}) should exceed far score (${scoreFar})`
  );
});

test("GraphRAGEngine executes end-to-end query expansion and grounded citation", async () => {
  const tmpDir = path.join(os.tmpdir(), `graph_rag_test_${Date.now()}`);
  const vStorePath = path.join(tmpDir, "vstore");
  const gStorePath = path.join(tmpDir, "gstore");

  const vStorage = new FileSystemStorageBackend(vStorePath);
  const vectorEngine = new VectorEngine({
    storage: vStorage,
    defaultEmbeddingProvider: new LocalHashEmbeddingProvider(64),
  });
  await vectorEngine.init();

  const gStorage = new FileSystemGraphStorage(gStorePath);
  const pipeline = new GraphIngestionPipeline({ storage: gStorage });

  // Ingest document into Knowledge Graph and Vector Engine
  const col = await vectorEngine.createCollection({ name: "tech_kb", dimension: 64 });
  const docText =
    "Rust is used to build Systems Programming applications. OpenAgent implements Policy Engine.";
  await vectorEngine.ingestDocument(col.name, { id: "doc_tech", text: docText });
  await pipeline.ingest({ id: "doc_tech", text: docText });

  const ragEngine = new GraphRAGEngine({
    storage: gStorage,
    vectorEngine,
  });

  const response = await ragEngine.query({
    query: "What is Rust used to build?",
    collection: col.name,
    use_graph: true,
  });

  assert.ok(response.latency_ms >= 0);
  assert.ok(response.context.entities.length >= 1);
  assert.ok(response.context.relationships.length >= 1);
  assert.ok(response.answer);
  assert.strictEqual(response.answer.status, "SUPPORTED");
  assert.ok(response.answer.text.includes("Systems Programming"));
  assert.ok(response.provenance.length >= 1);

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
