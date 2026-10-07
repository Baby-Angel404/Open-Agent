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
      `[${entry.timestamp}] ID:${entry.event_id} Session:${entry.session_id} Action:${entry.action} Decision:${entry.policy_decision} Result:${entry.result}`
    );
    console.log(`  Hash: ${entry.hash}`);
    if (entry.reason) console.log(`  Reason: ${entry.reason}`);
  }
}
