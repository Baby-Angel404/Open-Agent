import test from "node:test";
import assert from "node:assert";
import { ExecutorDispatcher, SecurityViolationError } from "../executor/dispatcher.js";
import { AgentAction } from "../types/action.js";
import { PolicyDecision } from "../types/policy.js";

function makeTestAction(): AgentAction {
  return {
    id: "act_test_binding",
    sessionId: "sess_bound",
    type: "navigate",
    target: "https://docs.example.com",
    parameters: { timeout: 5000 },
    timestamp: "2026-10-08T00:00:00.000Z",
    agentId: "agent_bound",
  };
}

test("Action Binding: dispatcher computes deterministic actionDigest", () => {
  const dispatcher = new ExecutorDispatcher();
  const a1 = makeTestAction();
  const a2 = makeTestAction();

  const d1 = dispatcher.computeActionDigest(a1);
  const d2 = dispatcher.computeActionDigest(a2);

  assert.strictEqual(d1, d2);
  assert.strictEqual(typeof d1, "string");
  assert.strictEqual(d1.length, 64);
});

test("Action Binding: dispatch succeeds with valid bound approval token within TTL", async () => {
  const dispatcher = new ExecutorDispatcher();
  const action = makeTestAction();
  const decision: PolicyDecision = {
    decision: "ALLOW",
    reason: "Explicit test allow",
    timestamp: new Date().toISOString(),
  };

  const approved = dispatcher.createApprovedAction(
    action,
    decision,
    new Date().toISOString(),
    5000
  );
  assert.strictEqual(dispatcher.verifyApproval(approved), true);

  const result = await dispatcher.dispatch(approved);
  assert.strictEqual(result.status, "SUCCESS");
});

test("Action Binding: dispatch fails closed when payload is mutated post-approval", async () => {
  const dispatcher = new ExecutorDispatcher();
  const action = makeTestAction();
  const decision: PolicyDecision = {
    decision: "ALLOW",
    reason: "Allow",
    timestamp: new Date().toISOString(),
  };

  const approved = dispatcher.createApprovedAction(action, decision);

  // Attacker tampers with the target after policy approval
  (approved.action as any).target = "https://malicious-phishing-site.example.com";

  await assert.rejects(
    async () => {
      await dispatcher.dispatch(approved);
    },
    (err: Error) => {
      assert.ok(err instanceof SecurityViolationError);
      assert.match(err.message, /payload digest mismatch/);
      return true;
    }
  );
});

test("Action Binding: dispatch fails closed when approval token has expired (TTL enforcement)", async () => {
  const dispatcher = new ExecutorDispatcher();
  const action = makeTestAction();
  const decision: PolicyDecision = {
    decision: "ALLOW",
    reason: "Allow",
    timestamp: new Date().toISOString(),
  };

  // Approved 20 seconds ago with a 10s TTL
  const approvedAt = new Date(Date.now() - 20000).toISOString();
  const approved = dispatcher.createApprovedAction(action, decision, approvedAt, 10000);

  await assert.rejects(
    async () => {
      await dispatcher.dispatch(approved);
    },
    (err: Error) => {
      assert.ok(err instanceof SecurityViolationError);
      assert.match(err.message, /approval token expired/);
      return true;
    }
  );
});

test("Action Binding: dispatch fails closed against replay attacks (token cannot be reused)", async () => {
  const dispatcher = new ExecutorDispatcher();
  const action = makeTestAction();
  const decision: PolicyDecision = {
    decision: "ALLOW",
    reason: "Allow",
    timestamp: new Date().toISOString(),
  };

  const approved = dispatcher.createApprovedAction(action, decision);

  // First dispatch succeeds
  const res1 = await dispatcher.dispatch(approved);
  assert.strictEqual(res1.status, "SUCCESS");

  // Replay attempt with the exact same approvedAction MUST fail
  await assert.rejects(
    async () => {
      await dispatcher.dispatch(approved);
    },
    (err: Error) => {
      assert.ok(err instanceof SecurityViolationError);
      assert.match(err.message, /approval token already consumed/);
      return true;
    }
  );
});

test("Action Binding: dispatch fails closed with forged approval token", async () => {
  const dispatcher = new ExecutorDispatcher();
  const action = makeTestAction();
  const decision: PolicyDecision = {
    decision: "ALLOW",
    reason: "Allow",
    timestamp: new Date().toISOString(),
  };

  const approved = dispatcher.createApprovedAction(action, decision);
  approved.approvalToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  await assert.rejects(
    async () => {
      await dispatcher.dispatch(approved);
    },
    (err: Error) => {
      assert.ok(err instanceof SecurityViolationError);
      assert.match(err.message, /invalid or forged approval token/);
      return true;
    }
  );
});
