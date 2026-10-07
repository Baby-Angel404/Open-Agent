import test from "node:test";
import assert from "node:assert";
import { ExecutorDispatcher, SecurityViolationError } from "../executor/dispatcher.js";
import { NavigationExecutor } from "../executor/navigation.executor.js";
import { ApprovedAction } from "../types/executor.js";
import { AgentAction } from "../types/action.js";
import { PolicyDecision } from "../types/policy.js";
import { validateAction, ValidationError } from "../policy/validator.js";
import { CapabilityRegistry, UnknownCapabilityError } from "../capability/registry.js";

test("Security Regression: Executor rejects unapproved direct invocation", async () => {
  const dispatcher = new ExecutorDispatcher();

  const fakeApproved: ApprovedAction = {
    action: {
      id: "forged_action",
      sessionId: "sess_x",
      type: "navigate",
      target: "https://evil.com",
      parameters: {},
      timestamp: new Date().toISOString(),
      agentId: "attacker",
    },
    decision: {
      decision: "DENY", // Denied decision!
      reason: "Forbidden",
      timestamp: new Date().toISOString(),
    },
    approvalToken: "fake_token_12345",
    approvedAt: new Date().toISOString(),
  };

  await assert.rejects(
    async () => {
      await dispatcher.dispatch(fakeApproved);
    },
    {
      name: "SecurityViolationError",
      message: /policy decision is not ALLOW/,
    }
  );
});

test("Security Regression: Executor rejects forged or invalid approval tokens", async () => {
  const dispatcher = new ExecutorDispatcher("secret_key_abc");

  const action: AgentAction = {
    id: "legit_looking_action",
    sessionId: "sess_y",
    type: "navigate",
    target: "https://docs.example.com",
    parameters: {},
    timestamp: new Date().toISOString(),
    agentId: "agent_1",
  };

  const decision: PolicyDecision = {
    decision: "ALLOW",
    reason: "Looks ok",
    timestamp: new Date().toISOString(),
  };

  const fakeApproved: ApprovedAction = {
    action,
    decision,
    approvalToken: "deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd", // forged token
    approvedAt: new Date().toISOString(),
  };

  await assert.rejects(
    async () => {
      await dispatcher.dispatch(fakeApproved);
    },
    {
      name: "SecurityViolationError",
      message: /invalid or forged approval token/,
    }
  );
});

test("Security Regression: Modifying action after approval fails verification", async () => {
  const dispatcher = new ExecutorDispatcher("secret_salt_xyz");
  const approvedAt = new Date().toISOString();

  const originalAction: AgentAction = {
    id: "action_alpha",
    sessionId: "sess_z",
    type: "navigate",
    target: "https://safe.example.com",
    parameters: {},
    timestamp: new Date().toISOString(),
    agentId: "agent_1",
  };

  const token = dispatcher.generateApprovalToken(originalAction.id || "", "ALLOW", approvedAt);

  // Attacker tampers action payload or ID after token was generated
  const tamperedAction: AgentAction = {
    ...originalAction,
    id: "action_tampered_id", // Tampered!
  };

  const approvedContainer: ApprovedAction = {
    action: tamperedAction,
    decision: { decision: "ALLOW", reason: "Approved", timestamp: approvedAt },
    approvalToken: token,
    approvedAt,
  };

  await assert.rejects(
    async () => {
      await dispatcher.dispatch(approvedContainer);
    },
    {
      name: "SecurityViolationError",
      message: /invalid or forged approval token/,
    }
  );
});

test("Security Regression: Strict action validation fails on missing required fields", () => {
  // Missing sessionId
  assert.throws(
    () => {
      validateAction(
        {
          id: "act_1",
          type: "navigate",
          target: "https://example.com",
          parameters: {},
          timestamp: new Date().toISOString(),
          agentId: "agent_1",
        },
        true
      );
    },
    {
      name: "ValidationError",
      message: /Action must contain a valid non-empty 'sessionId'/,
    }
  );

  // Missing parameters
  assert.throws(
    () => {
      validateAction(
        {
          id: "act_1",
          sessionId: "s1",
          type: "navigate",
          target: "https://example.com",
          timestamp: new Date().toISOString(),
          agentId: "agent_1",
        },
        true
      );
    },
    {
      name: "ValidationError",
      message: /Action must contain a valid 'parameters' object/,
    }
  );
});

test("Security Regression: Capability registry strictly asserts registered capabilities", () => {
  const registry = new CapabilityRegistry();

  assert.throws(
    () => {
      registry.assertCapabilitySupported("shell.execute_root");
    },
    {
      name: "UnknownCapabilityError",
      message: /is not registered in capability registry/,
    }
  );
});
