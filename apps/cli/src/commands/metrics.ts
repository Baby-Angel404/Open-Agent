import * as fs from "node:fs";
import { AppendOnlyAuditStore } from "@open-agent/core";
import { getAuditLogPath } from "./audit.js";
import { loadSessions } from "./session.js";

export function handleMetrics(options: { json?: boolean; filePath?: string }): void {
  const auditPath = getAuditLogPath(options.filePath);
  const sessions = loadSessions();

  let auditEntries: ReturnType<AppendOnlyAuditStore["getEntries"]> = [];
  let integrityValid = true;

  if (fs.existsSync(auditPath)) {
    const store = new AppendOnlyAuditStore(auditPath);
    auditEntries = store.getEntries();
    integrityValid = store.verifyIntegrity().valid;
  }

  const sessionCounts = {
    total: sessions.length,
    completed: sessions.filter((s) => s.status === "COMPLETED").length,
    failed: sessions.filter((s) => s.status === "FAILED").length,
    stopped: sessions.filter((s) => s.status === "STOPPED").length,
    running: sessions.filter((s) => s.status === "RUNNING").length,
  };

  const actionCounts = {
    proposed: auditEntries.filter(
      (e) => e.event_type === "ACTION_PROPOSED" || e.stage === "ACTION_PROPOSED"
    ).length,
    executed: auditEntries.filter(
      (e) => e.event_type === "ACTION_EXECUTED" || e.stage === "ACTION_EXECUTED"
    ).length,
    blocked: auditEntries.filter(
      (e) => e.event_type === "ACTION_BLOCKED" || e.stage === "ACTION_DENIED"
    ).length,
    failed: auditEntries.filter((e) => e.event_type === "ACTION_FAILED" || e.result === "failure")
      .length,
  };

  const securitySeverityCounts: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  for (const e of auditEntries) {
    if (e.security_metadata?.severity) {
      securitySeverityCounts[e.security_metadata.severity] =
        (securitySeverityCounts[e.security_metadata.severity] || 0) + 1;
    }
  }

  const mem = process.memoryUsage();
  const summary = {
    timestamp: new Date().toISOString(),
    sessions: sessionCounts,
    actions: actionCounts,
    security: securitySeverityCounts,
    integrity: integrityValid ? "VALID" : "CORRUPTED",
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      memoryUsageMb: Number((mem.rss / 1024 / 1024).toFixed(2)),
    },
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`=== OpenAgent Local Metrics & Observability ===`);
  console.log(`Timestamp:        ${summary.timestamp}`);
  console.log(`Audit Integrity:  ${summary.integrity}`);
  console.log(`Memory Usage:     ${summary.system.memoryUsageMb} MB`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`Sessions:`);
  console.log(`  Total:          ${sessionCounts.total}`);
  console.log(`  Running:        ${sessionCounts.running}`);
  console.log(`  Completed:      ${sessionCounts.completed}`);
  console.log(`  Failed:         ${sessionCounts.failed}`);
  console.log(`  Stopped:        ${sessionCounts.stopped}`);
  console.log(`Actions:`);
  console.log(`  Proposed:       ${actionCounts.proposed}`);
  console.log(`  Executed:       ${actionCounts.executed}`);
  console.log(`  Blocked:        ${actionCounts.blocked}`);
  console.log(`  Failed:         ${actionCounts.failed}`);
  console.log(`Security Events:`);
  console.log(`  CRITICAL:       ${securitySeverityCounts.CRITICAL || 0}`);
  console.log(`  HIGH:           ${securitySeverityCounts.HIGH || 0}`);
  console.log(`  MEDIUM:         ${securitySeverityCounts.MEDIUM || 0}`);
  console.log(`  LOW:            ${securitySeverityCounts.LOW || 0}`);
}
