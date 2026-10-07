import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { LocalAuditLogger } from "../audit/logger.js";
import { AuditEvent } from "../types/audit.js";

test("LocalAuditLogger appends events and maintains valid hash chain", () => {
  const tmpFile = path.join(os.tmpdir(), `test_audit_${Date.now()}.jsonl`);
  const logger = new LocalAuditLogger(tmpFile);

  const event1: AuditEvent = {
    event_id: "evt_1",
    session_id: "sess_1",
    timestamp: new Date().toISOString(),
    action: "navigate",
    target: "https://safe.example.com",
    policy_decision: "ALLOW",
    result: "success",
  };

  const event2: AuditEvent = {
    event_id: "evt_2",
    session_id: "sess_1",
    timestamp: new Date().toISOString(),
    action: "read_credentials",
    policy_decision: "DENY",
    result: "blocked",
  };

  const e1 = logger.append(event1);
  const e2 = logger.append(event2);

  assert.strictEqual(
    e1.prev_hash,
    "0000000000000000000000000000000000000000000000000000000000000000"
  );
  assert.strictEqual(e2.prev_hash, e1.hash);
  assert.strictEqual(logger.verifyIntegrity(), true);

  // Clean up
  if (fs.existsSync(tmpFile)) {
    fs.unlinkSync(tmpFile);
  }
});
