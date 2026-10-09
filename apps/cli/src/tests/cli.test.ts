import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadPolicy } from "../commands/policy.js";
import { runCLI } from "../bin/openagent.js";
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
import { handleNetworkStatus } from "../commands/network.js";
import {
  handlePeerList,
  handlePeerInspect,
  handlePeerConnect,
  handlePeerDisconnect,
  handlePeerBlock,
  handlePeerUnblock,
} from "../commands/peer.js";
import {
  handleCapabilityList,
  handleCapabilitySearch,
  handleCapabilityInspect,
  handleCapabilityRegister,
  handleCapabilityInvoke,
} from "../commands/capability.js";
import { handleReputationShow } from "../commands/reputation.js";
import { IdentityManager } from "@open-agent/network";
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

test("CLI network, peer, capability, and reputation commands execute successfully", async () => {
  const tmpDir = path.join(os.tmpdir(), `cli_network_test_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // 1. Network status
  await handleNetworkStatus({ storageDir: tmpDir });

  // 2. Peer connect and list
  const kp = IdentityManager.generateKeyPair();
  const testPeerId = kp.identity.agent_id;
  const testPubKey = kp.identity.public_key;
  await handlePeerConnect(testPeerId, {
    pubkey: testPubKey,
    address: "http://127.0.0.1:4243",
    storageDir: tmpDir,
  });

  await handlePeerList({ storageDir: tmpDir });
  await handlePeerList({ format: "json", storageDir: tmpDir });
  await handlePeerInspect(testPeerId, { storageDir: tmpDir });
  await handlePeerInspect(testPeerId, { format: "json", storageDir: tmpDir });

  // 3. Peer block and unblock
  await handlePeerBlock(testPeerId, { reason: "Testing block CLI", storageDir: tmpDir });
  await handlePeerUnblock(testPeerId, { storageDir: tmpDir });
  await handlePeerDisconnect(testPeerId, { storageDir: tmpDir });

  // 4. Capability list, search, inspect
  await handleCapabilityList({ storageDir: tmpDir });
  await handleCapabilityList({ format: "json", storageDir: tmpDir });
  await handleCapabilitySearch("search", { storageDir: tmpDir });
  await handleCapabilitySearch("search", { format: "json", storageDir: tmpDir });
  await handleCapabilityInspect("document.search@1.0", { storageDir: tmpDir });
  await handleCapabilityInspect("document.search@1.0", { format: "json", storageDir: tmpDir });

  // 5. Capability register (manifest file)
  const manifestPath = path.join(tmpDir, "custom-cap.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      capability_id: "sentiment.analyze@1.0",
      name: "sentiment.analyze",
      version: "1.0.0",
      description: "Analyze sentiment of text safely",
      input_schema: { type: "object", properties: { text: { type: "string" } } },
      output_schema: { type: "object", properties: { score: { type: "number" } } },
      required_permissions: [],
      risk_level: "LOW",
      provider_agent_id: testPeerId,
      availability: "ONLINE",
    })
  );
  await handleCapabilityRegister(manifestPath, { storageDir: tmpDir });

  // 6. Capability invoke
  await handleCapabilityInvoke(testPeerId, "document.search@1.0", {
    params: JSON.stringify({ query: "agent security", top_k: 3 }),
    storageDir: tmpDir,
  });

  // 7. Reputation show
  await handleReputationShow(testPeerId, { storageDir: tmpDir });
  await handleReputationShow(testPeerId, { format: "json", storageDir: tmpDir });

  // Reset exitCode if set during failure handling
  process.exitCode = 0;

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("CLI entrypoint outputs version for --version, -v, and version flags", async () => {
  const originalLog = console.log;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => {
    captured.push(args.map(String).join(" "));
  };
  try {
    await runCLI(["node", "openagent.js", "--version"]);
    await runCLI(["node", "openagent.js", "-v"]);
    await runCLI(["node", "openagent.js", "version"]);
    assert.strictEqual(captured.length, 3);
    for (const out of captured) {
      assert.ok(out.includes("OpenAgent CLI v0.2.0-alpha.1"));
    }
  } finally {
    console.log = originalLog;
  }
});
