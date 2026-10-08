import test from "node:test";
import assert from "node:assert";
import { ReputationManager } from "../reputation/reputation-manager.js";

test("ReputationManager updates scores deterministically based on verified evidence", () => {
  const rep = new ReputationManager();
  const agentId = "agent_test_rep";

  // Initial score is neutral 50.0
  const init = rep.getRecord(agentId);
  assert.strictEqual(init.score, 50.0);

  // Positive event
  rep.recordEvent({
    agent_id: agentId,
    event_type: "SUCCESSFUL_REQUEST",
    evidence_reference: "req_101 completed cleanly",
  });
  assert.strictEqual(rep.getRecord(agentId).score, 52.0);
  assert.strictEqual(rep.getRecord(agentId).successful_requests, 1);

  // Timeout event (-8)
  rep.recordEvent({
    agent_id: agentId,
    event_type: "TIMEOUT",
    evidence_reference: "req_102 timed out",
  });
  assert.strictEqual(rep.getRecord(agentId).score, 44.0);

  // Replay attempt (-30)
  rep.recordEvent({
    agent_id: agentId,
    event_type: "REPLAY_ATTEMPT",
    evidence_reference: "replayed nonce detected",
  });
  assert.strictEqual(rep.getRecord(agentId).score, 14.0);

  // Clamping check: can't drop below 0
  rep.recordEvent({
    agent_id: agentId,
    event_type: "POLICY_VIOLATION",
    evidence_reference: "attempted unauthorized file read",
  });
  assert.strictEqual(rep.getRecord(agentId).score, 0.0);
});
