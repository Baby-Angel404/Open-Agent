import test from "node:test";
import assert from "node:assert";
import * as path from "node:path";
import { loadPolicy } from "../commands/policy.js";
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
