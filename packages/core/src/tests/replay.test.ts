import test from "node:test";
import assert from "node:assert";
import { SessionReplayEngine } from "../replay/engine.js";
import { AppendOnlyAuditStore } from "../audit/store.js";
import { AuditEvent } from "../types/audit.js";

test("SessionReplayEngine deterministically reconstructs identical timeline in REPLAY_FOR_ANALYSIS mode", () => {
  const store = new AppendOnlyAuditStore();
  const sessionId = "sess_replay_test_1";

  const events: AuditEvent[] = [
    {
      event_id: "evt_1",
      session_id: sessionId,
      agent_id: "browser_agent",
      timestamp: "2026-10-08T10:00:00.000Z",
      event_type: "SESSION_CREATED",
      action: "session_start",
      metadata: { task: "Order test item" },
    },
    {
      event_id: "evt_2",
      session_id: sessionId,
      agent_id: "browser_agent",
      timestamp: "2026-10-08T10:00:01.000Z",
      event_type: "ACTION_PROPOSED",
      action: "navigate",
      target: "https://shop.example.com",
    },
    {
      event_id: "evt_3",
      session_id: sessionId,
      agent_id: "browser_agent",
      timestamp: "2026-10-08T10:00:02.000Z",
      event_type: "POLICY_EVALUATED",
      action: "navigate",
      target: "https://shop.example.com",
      policy_decision: "ALLOW",
      reason: "Domain in whitelist",
    },
    {
      event_id: "evt_4",
      session_id: sessionId,
      agent_id: "browser_agent",
      timestamp: "2026-10-08T10:00:03.000Z",
      event_type: "ACTION_EXECUTED",
      action: "navigate",
      target: "https://shop.example.com",
      result: "success",
    },
    {
      event_id: "evt_5",
      session_id: sessionId,
      agent_id: "browser_agent",
      timestamp: "2026-10-08T10:00:04.000Z",
      event_type: "ACTION_BLOCKED",
      action: "submit_payment",
      target: "https://shop.example.com/pay",
      policy_decision: "DENY",
      reason: "Payment action requires explicit approval",
      result: "blocked",
      security_metadata: {
        severity: "HIGH",
        category: "SENSITIVE_ACTION_BLOCKED",
        alert: true,
        classification_reason: "Payment blocked",
      },
    },
    {
      event_id: "evt_6",
      session_id: sessionId,
      agent_id: "browser_agent",
      timestamp: "2026-10-08T10:00:05.000Z",
      event_type: "SESSION_COMPLETED",
      action: "session_finish",
    },
  ];

  for (const e of events) {
    store.append(e);
  }

  const engine = new SessionReplayEngine();
  const entries = store.getEntries();

  // Run replay twice to confirm absolute determinism
  const run1 = engine.replaySession(sessionId, entries);
  const run2 = engine.replaySession(sessionId, entries);

  assert.strictEqual(run1.mode, "REPLAY_FOR_ANALYSIS");
  assert.strictEqual(run1.sessionId, sessionId);
  assert.strictEqual(run1.agentId, "browser_agent");
  assert.strictEqual(run1.initialTask, "Order test item");
  assert.strictEqual(run1.status, "COMPLETED");
  assert.strictEqual(run1.durationMs, 5000);
  assert.strictEqual(run1.totalActionsExecuted, 1);
  assert.strictEqual(run1.totalActionsBlocked, 1);
  assert.strictEqual(run1.timeline.length, 6);

  // Security alert was captured
  assert.strictEqual(run1.securityAlerts.length, 1);
  assert.strictEqual(run1.securityAlerts[0].severity, "HIGH");
  assert.strictEqual(run1.securityAlerts[0].action, "submit_payment");

  // Browser trace captured
  assert.strictEqual(run1.browserActionTrace.length, 2); // proposed navigate + executed navigate

  // Strict determinism check: run1 and run2 timelines and fields must be identical
  assert.deepStrictEqual(run1.timeline, run2.timeline);
  assert.deepStrictEqual(run1.securityAlerts, run2.securityAlerts);
  assert.deepStrictEqual(run1.browserActionTrace, run2.browserActionTrace);
});

test("SessionReplayEngine text formatter renders readable report", () => {
  const store = new AppendOnlyAuditStore();
  const sessionId = "sess_fmt";

  store.append({
    event_id: "e1",
    session_id: sessionId,
    timestamp: "2026-10-08T12:00:00.000Z",
    event_type: "SESSION_CREATED",
    metadata: { task: "Format check" },
  });

  const engine = new SessionReplayEngine();
  const report = engine.replaySession(sessionId, store.getEntries());
  const text = SessionReplayEngine.formatReportText(report);

  assert.ok(text.includes("=== Session Replay (Analysis Mode) ==="));
  assert.ok(text.includes("sess_fmt"));
  assert.ok(text.includes("Format check"));
});
