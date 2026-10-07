import test from "node:test";
import assert from "node:assert";
import { loadPolicy } from "../commands/policy.js";
import { handleAgentStart, handleAgentStatus } from "../commands/agent.js";
import { handleSessionList, loadSessions } from "../commands/session.js";
import { handleAuditList } from "../commands/audit.js";
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
