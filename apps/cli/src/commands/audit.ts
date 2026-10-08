import * as path from "node:path";
import * as fs from "node:fs";
import { LocalAuditLogger, AppendOnlyAuditStore } from "@open-agent/core";

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
      `[${entry.timestamp}] ID:${entry.event_id} Session:${entry.session_id} Stage:${entry.stage || entry.event_type || "N/A"} Action:${entry.action || "N/A"} Decision:${entry.policy_decision || "N/A"}`
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
  console.log(`Event Type:        ${entry.event_type || entry.stage || "N/A"}`);
  console.log(`Action:            ${entry.action || "N/A"}`);
  if (entry.target) console.log(`Target:            ${entry.target}`);
  if (entry.policy_decision) console.log(`Policy Decision:   ${entry.policy_decision}`);
  if (entry.reason) console.log(`Decision Reason:   ${entry.reason}`);
  if (entry.result) console.log(`Result:            ${entry.result}`);
  if (entry.error) console.log(`Error:             ${entry.error}`);
  if (entry.security_metadata) {
    console.log(`Severity:          ${entry.security_metadata.severity}`);
    if (entry.security_metadata.category)
      console.log(`Category:          ${entry.security_metadata.category}`);
  }
  console.log(`Hash:              ${entry.hash}`);
  console.log(`Prev Hash:         ${entry.prev_hash}`);
  if (entry.proposed_action) {
    console.log(`Proposed Action:   ${JSON.stringify(entry.proposed_action, null, 2)}`);
  }
  if (entry.execution_result) {
    console.log(`Execution Result:  ${JSON.stringify(entry.execution_result, null, 2)}`);
  }
}

export function handleAuditVerify(filePath?: string, sessionId?: string): boolean {
  const targetPath = getAuditLogPath(filePath);
  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Audit log file not found at: ${targetPath}`);
    return false;
  }

  const store = new AppendOnlyAuditStore(targetPath);
  let entries = store.getEntries();
  if (sessionId) {
    entries = entries.filter((e) => e.session_id === sessionId);
  }

  const result = store.verifyIntegrity(sessionId ? entries : undefined);

  console.log(`=== Cryptographic Audit Hash Chain Verification ===`);
  console.log(`File:           ${targetPath}`);
  if (sessionId) console.log(`Session:        ${sessionId}`);
  console.log(`Total Entries:  ${result.totalEntries}`);
  console.log(`Verified:       ${result.verifiedEntries}`);

  if (result.valid) {
    console.log(`Result:         PASSED (Integrity intact, zero tampering detected)`);
    console.log(`Last Chain Hash:${store.getLastHash()}`);
    return true;
  } else {
    console.error(`Result:         FAILED (Cryptographic corruption or tampering detected!)`);
    console.error(`Broken Index:   ${result.brokenAtIndex}`);
    console.error(`Event ID:       ${result.brokenAtEventId}`);
    console.error(`Reason:         ${result.reason}`);
    return false;
  }
}

export function handleAuditExport(sessionId: string, outputPath?: string, filePath?: string): void {
  const targetPath = getAuditLogPath(filePath);
  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Audit log file not found at: ${targetPath}`);
    return;
  }

  const store = new AppendOnlyAuditStore(targetPath);
  const bundle = store.exportSession(sessionId);

  if (bundle.entries.length === 0) {
    console.error(`Error: No audit entries found for session '${sessionId}'`);
    return;
  }

  const destination = outputPath
    ? path.resolve(process.cwd(), outputPath)
    : path.resolve(process.cwd(), `audit-bundle-${sessionId}.json`);

  fs.writeFileSync(destination, JSON.stringify(bundle, null, 2), "utf-8");

  console.log(`=== Exported Verifiable Audit Bundle ===`);
  console.log(`Session ID:     ${bundle.sessionId}`);
  console.log(`Exported To:    ${destination}`);
  console.log(`Entries:        ${bundle.entries.length}`);
  console.log(`Root Hash:      ${bundle.rootHash}`);
  console.log(`Leaf Hash:      ${bundle.leafHash}`);
  console.log(`Integrity Valid:${bundle.integrityValid ? "YES" : "NO"}`);
}
