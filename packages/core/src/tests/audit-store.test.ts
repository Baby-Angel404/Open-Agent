import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AppendOnlyAuditStore, GENESIS_HASH } from "../audit/store.js";
import { AuditEvent, AuditLogEntry } from "../types/audit.js";

test("AppendOnlyAuditStore writes events with sequence numbers and valid hash chain", () => {
  const tmpFile = path.join(os.tmpdir(), `test_store_${Date.now()}.jsonl`);
  const store = new AppendOnlyAuditStore(tmpFile);

  const e1 = store.append({
    event_id: "evt_1",
    session_id: "sess_1",
    agent_id: "agent_test",
    timestamp: "2026-10-08T00:00:00.000Z",
    event_type: "SESSION_CREATED",
    action: "session_start",
  });

  const e2 = store.append({
    event_id: "evt_2",
    session_id: "sess_1",
    agent_id: "agent_test",
    timestamp: "2026-10-08T00:00:01.000Z",
    event_type: "ACTION_PROPOSED",
    action: "navigate",
    target: "https://docs.example.com",
  });

  assert.strictEqual(e1.sequence_number, 1);
  assert.strictEqual(e1.prev_hash, GENESIS_HASH);
  assert.strictEqual(e2.sequence_number, 2);
  assert.strictEqual(e2.prev_hash, e1.hash);

  const verification = store.verifyIntegrity();
  assert.strictEqual(verification.valid, true);
  assert.strictEqual(verification.totalEntries, 2);
  assert.strictEqual(verification.verifiedEntries, 2);

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

test("AppendOnlyAuditStore accurately detects payload tampering and pinpoints broken index", () => {
  const tmpFile = path.join(os.tmpdir(), `test_tamper_${Date.now()}.jsonl`);
  const store = new AppendOnlyAuditStore(tmpFile);

  store.append({
    event_id: "evt_1",
    session_id: "sess_1",
    agent_id: "agent_test",
    timestamp: "2026-10-08T00:00:00.000Z",
    event_type: "SESSION_CREATED",
  });
  store.append({
    event_id: "evt_2",
    session_id: "sess_1",
    agent_id: "agent_test",
    timestamp: "2026-10-08T00:00:01.000Z",
    event_type: "ACTION_EXECUTED",
    action: "navigate",
  });
  store.append({
    event_id: "evt_3",
    session_id: "sess_1",
    agent_id: "agent_test",
    timestamp: "2026-10-08T00:00:02.000Z",
    event_type: "SESSION_COMPLETED",
  });

  const entries: AuditLogEntry[] = JSON.parse(JSON.stringify(store.getEntries()));

  // Tamper with payload of entry 1 (evt_2)
  entries[1].action = "malicious_injected_action";

  const tamperedResult = store.verifyIntegrity(entries);
  assert.strictEqual(tamperedResult.valid, false);
  assert.strictEqual(tamperedResult.brokenAtIndex, 1);
  assert.strictEqual(tamperedResult.brokenAtEventId, "evt_2");
  assert.match(tamperedResult.reason || "", /Hash integrity check failed/);

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

test("AppendOnlyAuditStore detects event deletion in the chain", () => {
  const tmpFile = path.join(os.tmpdir(), `test_deletion_${Date.now()}.jsonl`);
  const store = new AppendOnlyAuditStore(tmpFile);

  store.append({
    event_id: "evt_1",
    session_id: "sess_1",
    timestamp: "2026-10-08T00:00:00.000Z",
    event_type: "SESSION_CREATED",
  });
  store.append({
    event_id: "evt_2",
    session_id: "sess_1",
    timestamp: "2026-10-08T00:00:01.000Z",
    event_type: "ACTION_EXECUTED",
  });
  store.append({
    event_id: "evt_3",
    session_id: "sess_1",
    timestamp: "2026-10-08T00:00:02.000Z",
    event_type: "SESSION_COMPLETED",
  });

  const entries: AuditLogEntry[] = JSON.parse(JSON.stringify(store.getEntries()));

  // Delete middle entry
  entries.splice(1, 1);

  const result = store.verifyIntegrity(entries);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.brokenAtIndex, 1);
  assert.match(result.reason || "", /Previous hash mismatch/);

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

test("AppendOnlyAuditStore queries and filters correctly", () => {
  const store = new AppendOnlyAuditStore();

  store.append({
    event_id: "e1",
    session_id: "s_alpha",
    agent_id: "agent_1",
    timestamp: "2026-10-08T01:00:00.000Z",
    event_type: "SESSION_CREATED",
    security_metadata: { severity: "INFO" },
  });
  store.append({
    event_id: "e2",
    session_id: "s_alpha",
    agent_id: "agent_1",
    timestamp: "2026-10-08T01:01:00.000Z",
    event_type: "ACTION_BLOCKED",
    action: "read_secret",
    target: "vault://creds",
    security_metadata: {
      severity: "HIGH",
      alert: true,
      classification_reason: "Sensitive read blocked",
    },
  });
  store.append({
    event_id: "e3",
    session_id: "s_beta",
    agent_id: "agent_2",
    timestamp: "2026-10-08T02:00:00.000Z",
    event_type: "SESSION_CREATED",
    security_metadata: { severity: "INFO" },
  });

  // Filter by session
  const alphaEvents = store.query({ sessionId: "s_alpha" });
  assert.strictEqual(alphaEvents.length, 2);

  // Filter by severity
  const highEvents = store.query({ severity: "HIGH" });
  assert.strictEqual(highEvents.length, 1);
  assert.strictEqual(highEvents[0].event_id, "e2");

  // Free-text search
  const textEvents = store.query({ textSearch: "vault" });
  assert.strictEqual(textEvents.length, 1);
  assert.strictEqual(textEvents[0].event_id, "e2");
});

test("AppendOnlyAuditStore exports standalone verifiable bundle", () => {
  const store = new AppendOnlyAuditStore();

  store.append({
    event_id: "e1",
    session_id: "s_bundle",
    agent_id: "a1",
    timestamp: "2026-10-08T01:00:00.000Z",
    event_type: "SESSION_CREATED",
  });
  store.append({
    event_id: "e2",
    session_id: "s_bundle",
    agent_id: "a1",
    timestamp: "2026-10-08T01:01:00.000Z",
    event_type: "SESSION_COMPLETED",
  });

  const bundle = store.exportSession("s_bundle");
  assert.strictEqual(bundle.sessionId, "s_bundle");
  assert.strictEqual(bundle.entries.length, 2);
  assert.strictEqual(bundle.integrityValid, true);

  const verified = AppendOnlyAuditStore.verifyBundle(bundle);
  assert.strictEqual(verified.valid, true);
  assert.strictEqual(verified.totalEntries, 2);
});

test("AppendOnlyAuditStore applies log retention and rotation on size threshold", () => {
  const tmpFile = path.join(os.tmpdir(), `test_retention_${Date.now()}.jsonl`);
  const store = new AppendOnlyAuditStore(tmpFile);

  // Append events until threshold triggers rotation
  for (let i = 0; i < 5; i++) {
    store.append({
      event_id: `evt_rot_${i}`,
      session_id: "sess_rot",
      timestamp: new Date().toISOString(),
      event_type: "ACTION_PROPOSED",
      action: "navigate",
      metadata: { padding: "x".repeat(50) },
    });
  }

  const rotation = store.applyRetention({ maxFileSizeBytes: 100 });
  assert.strictEqual(rotation.rotated, true);
  assert.ok(rotation.archivedPath);
  assert.ok(fs.existsSync(rotation.archivedPath!));

  // Clean up
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  if (rotation.archivedPath && fs.existsSync(rotation.archivedPath))
    fs.unlinkSync(rotation.archivedPath);
});
