import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { chunkText, ingestDocument } from "../ingestion/chunker.js";
import { VectorEngine } from "../engine/engine.js";
import { FileSystemStorageBackend } from "../storage/fs.storage.js";

test("Chunking: preserves document hierarchy and sequence order", () => {
  const longText = `
# OpenAgent Architecture

OpenAgent Infrastructure provides an execution substrate where AI models act solely as proposers of actions.

Deterministic code gates act as authorizers and enforcers.

## Security Guarantees

In traditional agent systems, the model has direct access to APIs.
OpenAgent strictly enforces trust boundaries and fail-closed policies.
`.trim();

  const chunks = chunkText(longText, "doc_arch_1", { chunk_size: 100, overlap: 20 });

  assert.ok(chunks.length >= 2);
  for (let i = 0; i < chunks.length; i++) {
    assert.strictEqual(chunks[i].document_id, "doc_arch_1");
    assert.strictEqual(chunks[i].sequence_number, i);
    assert.strictEqual(chunks[i].chunk_id, `doc_arch_1_chk_${i}`);
    assert.ok(chunks[i].text.length > 0);
    assert.strictEqual(chunks[i].metadata?.document_id, "doc_arch_1");
  }
});

test("Ingestion: end-to-end document ingestion and hybrid retrieval", async () => {
  const tmpDir = path.join(os.tmpdir(), `test_ingest_${Date.now()}`);
  const engine = new VectorEngine({ storage: new FileSystemStorageBackend(tmpDir) });
  await engine.init();

  await engine.createCollection({ name: "docs_kb", dimension: 64 });

  const inserted = await engine.ingestDocument("docs_kb", {
    id: "guide_doc",
    source: "guides/security.md",
    text: `
# Security Policy Guide
All actions are denied by default unless an explicit rule allows them.
Sensitive operations like file writes and payments always require explicit confirmation.
`.trim(),
  });

  assert.ok(inserted.length >= 1);
  assert.strictEqual(inserted[0].content_ref, "guides/security.md");

  // Search for ingested content
  const res = await engine.search({
    collection: "docs_kb",
    query: "denied by default security policy",
    mode: "hybrid",
    top_k: 3,
  });

  assert.ok(res.results.length >= 1);
  assert.ok(res.results[0].text?.includes("denied by default"));

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});
