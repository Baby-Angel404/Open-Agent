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
