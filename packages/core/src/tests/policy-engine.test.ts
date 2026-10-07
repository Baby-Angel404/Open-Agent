import test from "node:test";
import assert from "node:assert";
import { PolicyEngine } from "../policy/engine.js";
import { Policy } from "../types/policy.js";
import { AgentAction } from "../types/action.js";
import { ValidationError } from "../policy/validator.js";

const basePolicy: Policy = {
  id: "pol_test_01",
  name: "Test Policy",
  version: "1.0.0",
  defaultDecision: "DENY",
  allowedDomains: ["safe.example.com", "api.example.com"],
  deniedDomains: ["malicious.example.com", "tracker.bad"],
  sensitiveActionTypes: ["custom_sensitive_op"],
  rules: [
    {
      id: "rule_nav_allow",
      actionType: "navigate",
      decision: "ALLOW",
      targetPattern: "https://safe.example.com/*",
      description: "Allow safe navigation",
    },
    {
      id: "rule_nav_ask",
      actionType: "navigate",
      decision: "ASK_USER",
      targetPattern: "https://api.example.com/*",
      description: "Ask user for api navigation",
    },
    {
      id: "rule_download_explicit_deny",
      actionType: "download_file",
      decision: "DENY",
      description: "Explicitly forbidden file download",
    },
    {
      id: "rule_read_dom_limited",
      actionType: "read_dom",
      decision: "ALLOW",
      rateLimitPerMinute: 2,
      description: "Rate limited DOM reads",
    },
  ],
};

test("1. explicitly allowed action executes and returns ALLOW", () => {
  const engine = new PolicyEngine();
  const action: AgentAction = {
    type: "navigate",
    target: "https://safe.example.com/*",
  };
  const decision = engine.evaluate(action, basePolicy);
  assert.strictEqual(decision.decision, "ALLOW");
  assert.strictEqual(decision.matchedRuleId, "rule_nav_allow");
});

test("2. explicitly denied action returns DENY", () => {
  const engine = new PolicyEngine();
  const action: AgentAction = {
    type: "download_file",
  };
  const decision = engine.evaluate(action, basePolicy);
  assert.strictEqual(decision.decision, "DENY");
  assert.strictEqual(decision.matchedRuleId, "rule_download_explicit_deny");
});

test("3. unknown non-sensitive action without rule returns default fallback (DENY)", () => {
  const engine = new PolicyEngine();
  const action: AgentAction = {
    type: "unknown_custom_action_123",
  };
  const decision = engine.evaluate(action, basePolicy);
  assert.strictEqual(decision.decision, "DENY");
  assert.match(decision.reason, /Default DENY: No matching rule found/);
});

test("4. unknown domain not in allowedDomains returns DENY", () => {
  const engine = new PolicyEngine();
  const action: AgentAction = {
    type: "navigate",
    target: "https://unknown.external-site.org/page",
  };
  const decision = engine.evaluate(action, basePolicy);
  assert.strictEqual(decision.decision, "DENY");
  assert.match(decision.reason, /not present in policy allowedDomains/);
});

test("4b. domain in deniedDomains returns immediate DENY", () => {
  const engine = new PolicyEngine();
  const action: AgentAction = {
    type: "navigate",
    target: "https://malicious.example.com/exploit",
  };
  const decision = engine.evaluate(action, basePolicy);
  assert.strictEqual(decision.decision, "DENY");
  assert.match(decision.reason, /explicitly in policy deniedDomains/);
});

test("5. malformed policy throws ValidationError", () => {
  const engine = new PolicyEngine();
  const action: AgentAction = {
    type: "navigate",
  };

  // Missing rules array
  assert.throws(
    () => {
      engine.evaluate(action, { id: "p1", name: "bad", version: "1.0.0" } as unknown as Policy);
    },
    {
      name: "ValidationError",
      message: /Policy 'rules' must be an array/,
    }
  );

  // Invalid rule decision
  assert.throws(
    () => {
      engine.evaluate(action, {
        id: "p1",
        name: "bad",
        version: "1.0",
        rules: [{ id: "r1", actionType: "a", decision: "MAYBE" }],
      } as unknown as Policy);
    },
    {
      name: "ValidationError",
      message: /invalid decision 'MAYBE'/,
    }
  );
});

test("6. malformed action throws ValidationError", () => {
  const engine = new PolicyEngine();

  // Null action
  assert.throws(
    () => {
      engine.evaluate(null as unknown as AgentAction, basePolicy);
    },
    {
      name: "ValidationError",
      message: /Action must be a valid non-null object/,
    }
  );

  // Missing type string
  assert.throws(
    () => {
      engine.evaluate({ type: "" } as AgentAction, basePolicy);
    },
    {
      name: "ValidationError",
      message: /Action must contain a valid non-empty 'type' string/,
    }
  );
});

test("7. sensitive action without permission is DENIED by default", () => {
  const engine = new PolicyEngine();

  // Inherently sensitive action (shell_exec)
  const action1: AgentAction = {
    type: "shell_exec",
    payload: { cmd: "rm -rf /" },
  };
  const dec1 = engine.evaluate(action1, basePolicy);
  assert.strictEqual(dec1.decision, "DENY");
  assert.match(dec1.reason, /Default Deny: Sensitive action 'shell_exec'/);

  // Action marked with custom sensitivity in policy
  const action2: AgentAction = {
    type: "custom_sensitive_op",
  };
  const dec2 = engine.evaluate(action2, basePolicy);
  assert.strictEqual(dec2.decision, "DENY");
  assert.match(dec2.reason, /Default Deny: Sensitive action 'custom_sensitive_op'/);

  // Action explicitly flagged as sensitive via action.isSensitive
  const action3: AgentAction = {
    type: "custom_flagged_action",
    isSensitive: true,
  };
  const dec3 = engine.evaluate(action3, basePolicy);
  assert.strictEqual(dec3.decision, "DENY");
  assert.match(dec3.reason, /Default Deny: Sensitive action/);
});

test("8. default-deny behavior for policy with no matching rules and sensitive target", () => {
  const strictPolicy: Policy = {
    id: "strict_blank",
    name: "Blank Strict Policy",
    version: "1.0.0",
    rules: [], // No rules at all
  };
  const engine = new PolicyEngine();
  const action: AgentAction = {
    type: "execute_code",
  };

  const decision = engine.evaluate(action, strictPolicy);
  assert.strictEqual(decision.decision, "DENY");
  assert.match(decision.reason, /Default Deny/);
});

test("9. rate limiting rule returns LIMITED when threshold is exceeded", () => {
  const engine = new PolicyEngine();
  const action: AgentAction = {
    type: "read_dom",
  };

  // Call 1
  const d1 = engine.evaluate(action, basePolicy);
  assert.strictEqual(d1.decision, "ALLOW");

  // Call 2
  const d2 = engine.evaluate(action, basePolicy);
  assert.strictEqual(d2.decision, "ALLOW");

  // Call 3 (limit is 2 per minute)
  const d3 = engine.evaluate(action, basePolicy);
  assert.strictEqual(d3.decision, "LIMITED");
  assert.match(d3.reason, /Rate limit of 2 calls\/minute exceeded/);
});

test("10. ASK_USER decision is properly returned when designated", () => {
  const engine = new PolicyEngine();
  const action: AgentAction = {
    type: "navigate",
    target: "https://api.example.com/*",
  };
  const decision = engine.evaluate(action, basePolicy);
  assert.strictEqual(decision.decision, "ASK_USER");
  assert.strictEqual(decision.matchedRuleId, "rule_nav_ask");
});
