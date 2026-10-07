import * as path from "node:path";
import * as fs from "node:fs";
import { LocalAuditLogger } from "@open-agent/core";

export function getAuditLogPath(customPath?: string): string {
  if (customPath) {
    return path.resolve(process.cwd(), customPath);
  }
  return path.resolve(process.cwd(), ".audit-logs/audit-events.jsonl");
}

export function handleAuditList(filePath?: string): void {
  const targetPath = getAuditLogPath(filePath);
  if (!fs.existsSync(targetPath)) {
    console.log(`[Audit] No audit log file found at: ${targetPath}`);
    console.log("[Audit] Total logged events: 0");
    return;
  }

  const logger = new LocalAuditLogger(targetPath);
  const entries = logger.getEntries();
  const isValid = logger.verifyIntegrity();

  console.log(`=== Local Audit Log (${entries.length} entries) ===`);
  console.log(`Log File:      ${targetPath}`);
  console.log(`Integrity:     ${isValid ? "VALID (Hash chain verified)" : "INVALID (Tampered)"}`);
  console.log("--------------------------------------------------------------------------------");

  for (const entry of entries) {
    console.log(
      `[${entry.timestamp}] ID:${entry.event_id} Session:${entry.session_id} Stage:${entry.stage || "N/A"} Action:${entry.action} Decision:${entry.policy_decision || "N/A"}`
    );
    console.log(`  Hash: ${entry.hash}`);
    if (entry.reason) console.log(`  Reason: ${entry.reason}`);
  }
}

export function handleAuditShow(eventId: string, filePath?: string): void {
  const targetPath = getAuditLogPath(filePath);
  if (!fs.existsSync(targetPath)) {
    console.error(`Audit log file not found at: ${targetPath}`);
    return;
  }

  const logger = new LocalAuditLogger(targetPath);
  const entries = logger.getEntries();
  const entry = entries.find((e) => e.event_id === eventId);

  if (!entry) {
    console.error(`Audit event '${eventId}' not found.`);
    return;
  }

  console.log(`=== Audit Event Details: ${entry.event_id} ===`);
  console.log(`Session ID:        ${entry.session_id}`);
  console.log(`Timestamp:         ${entry.timestamp}`);
  console.log(`Stage:             ${entry.stage || "N/A"}`);
  console.log(`Action:            ${entry.action}`);
  if (entry.target) console.log(`Target:            ${entry.target}`);
  if (entry.policy_decision) console.log(`Policy Decision:   ${entry.policy_decision}`);
  if (entry.reason) console.log(`Decision Reason:   ${entry.reason}`);
  if (entry.result) console.log(`Result:            ${entry.result}`);
  if (entry.error) console.log(`Error:             ${entry.error}`);
  console.log(`Hash:              ${entry.hash}`);
  console.log(`Prev Hash:         ${entry.prev_hash}`);
  if (entry.proposed_action) {
    console.log(`Proposed Action:   ${JSON.stringify(entry.proposed_action, null, 2)}`);
  }
  if (entry.execution_result) {
    console.log(`Execution Result:  ${JSON.stringify(entry.execution_result, null, 2)}`);
  }
}
