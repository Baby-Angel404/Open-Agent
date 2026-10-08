import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadPolicy } from "../commands/policy.js";
import { handleAgentStart, handleAgentStatus } from "../commands/agent.js";
import { handleSessionList, loadSessions, handleSessionReplay } from "../commands/session.js";
import { handleAuditList, handleAuditVerify, handleAuditExport } from "../commands/audit.js";
import { handleMetrics } from "../commands/metrics.js";
import {
  handleCollectionCreate,
  handleCollectionList,
  handleCollectionDelete,
  handleDocumentAdd,
  handleDocumentIndex,
  handleSearch,
  handleIndexStatus,
  handleVectorBenchmark,
} from "../commands/vector.js";
import {
  handleGraphIngest,
  handleGraphStatus,
  handleGraphEntities,
  handleGraphSearch,
  handleGraphRelationships,
  handleGraphVerify,
  handleGraphRepair,
} from "../commands/graph.js";
import { handleRagQuery } from "../commands/rag.js";
import { PolicyEngine, AgentAction } from "@open-agent/core";

test("CLI policy loader reads default policy correctly", () => {
  const policy = loadPolicy();

  assert.strictEqual(policy.id, "policy_default_v1");
  assert.strictEqual(policy.defaultDecision, "DENY");
  assert.ok(Array.isArray(policy.rules));
  assert.ok(policy.rules.length > 0);
});

test("CLI policy check integrates with PolicyEngine", () => {
  const policy = loadPolicy();
  const engine = new PolicyEngine();

  const action: AgentAction = {
    type: "navigate",
    target: "https://example.com/landing",
  };

  const decision = engine.evaluate(action, policy);
  assert.strictEqual(decision.decision, "ALLOW");
  assert.strictEqual(decision.matchedRuleId, "rule_allow_safe_nav");
});

test("CLI agent start executes real runtime task", async () => {
  await handleAgentStart({
    task: "Navigate to docs at https://docs.openagent.org",
    agentId: "cli_test_agent",
    maxSteps: 2,
  });

  const sessions = loadSessions();
  assert.ok(sessions.length > 0);
  const latestSession = sessions[sessions.length - 1];
  assert.strictEqual(latestSession.agentId, "cli_test_agent");
  assert.ok(latestSession.history.length > 0);

  // Status and list commands execute without errors
  handleAgentStatus();
  handleSessionList();
  handleAuditList();
});

test("CLI audit verify, export, session replay, and metrics execute successfully", () => {
  const sessions = loadSessions();
  assert.ok(sessions.length > 0);
  const sessionId = sessions[sessions.length - 1].id;

  // 1. Audit Verify
  const isChainValid = handleAuditVerify();
  assert.strictEqual(isChainValid, true);

  // 2. Audit Export
  const tmpExport = path.join(os.tmpdir(), `cli_export_${Date.now()}.json`);
  handleAuditExport(sessionId, tmpExport);
  assert.ok(fs.existsSync(tmpExport));
  const bundle = JSON.parse(fs.readFileSync(tmpExport, "utf-8"));
  assert.strictEqual(bundle.sessionId, sessionId);
  assert.strictEqual(bundle.integrityValid, true);
  fs.unlinkSync(tmpExport);

  // 3. Session Replay
  assert.doesNotThrow(() => {
    handleSessionReplay(sessionId, { verbose: true, format: "text" });
  });

  assert.doesNotThrow(() => {
    handleSessionReplay(sessionId, { format: "json" });
  });

  // 4. Metrics
  assert.doesNotThrow(() => {
    handleMetrics({ json: false });
  });
  assert.doesNotThrow(() => {
    handleMetrics({ json: true });
  });
});

test("CLI vector commands lifecycle (create, add, index, search, status, delete)", async () => {
  const tmpDir = path.join(os.tmpdir(), `cli_vector_test_${Date.now()}`);
  const colName = "test_cli_kb";

  // 1. Create collection
  await handleCollectionCreate(colName, { dim: 64, metric: "cosine", path: tmpDir });

  // 2. List collections
  await handleCollectionList({ path: tmpDir });

  // 3. Document Add
  const sampleDocPath = path.join(tmpDir, "sample.md");
  fs.writeFileSync(
    sampleDocPath,
    "# AI Policy\n\nAll autonomous agents must obey deterministic policy checks before execution.\n\n## Auditing\nEvery action is recorded to an append-only cryptographic audit log."
  );

  await handleDocumentAdd(colName, { file: sampleDocPath, path: tmpDir });

  // 4. Document Index
  await handleDocumentIndex(colName, { path: tmpDir });

  // 5. Index Status
  await handleIndexStatus(colName, { path: tmpDir });

  // 6. Search
  await handleSearch(colName, {
    query: "deterministic policy checks",
    mode: "hybrid",
    topK: 3,
    path: tmpDir,
  });
  await handleSearch(colName, {
    query: "cryptographic audit",
    mode: "sparse",
    topK: 3,
    path: tmpDir,
  });
  await handleSearch(colName, {
    query: "autonomous agents",
    mode: "dense",
    topK: 3,
    path: tmpDir,
  });

  // 7. Delete collection
  await handleCollectionDelete(colName, { path: tmpDir });

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("CLI vector benchmark executes successfully", async () => {
  await handleVectorBenchmark({ count: 100 });
});

test("CLI Knowledge Graph & Graph RAG end-to-end commands", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openagent-cli-graph-test-"));
  const sampleDoc = path.join(tmpDir, "sample-system.md");
  fs.writeFileSync(
    sampleDoc,
    "OpenAgent Infrastructure uses Rust for high performance retrieval. OpenAgent Infrastructure implements Policy Engine for security boundaries. Policy Engine enforces deterministic checks."
  );

  // 1. Ingest
  await handleGraphIngest(sampleDoc, { path: tmpDir });

  // 2. Status
  await handleGraphStatus({ path: tmpDir });

  // 3. Entities
  await handleGraphEntities({ path: tmpDir });
  await handleGraphEntities({ type: "TECHNOLOGY", path: tmpDir });
  await handleGraphEntities({ query: "Policy", path: tmpDir });

  // 4. Search
  await handleGraphSearch("Rust", { path: tmpDir });

  // 5. Relationships
  await handleGraphRelationships({ path: tmpDir });
  await handleGraphRelationships({ predicate: "IMPLEMENTS", path: tmpDir });

  // 6. Verify & Repair
  await handleGraphVerify({ path: tmpDir });
  await handleGraphRepair({ path: tmpDir });

  // 7. Graph RAG query
  await handleRagQuery("What does OpenAgent Infrastructure implement?", {
    path: tmpDir,
    expandGraph: true,
    depth: 2,
  });

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
