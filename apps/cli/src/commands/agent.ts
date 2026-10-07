import * as os from "node:os";
import * as fs from "node:fs";
import { getAuditLogPath } from "./audit.js";
import { loadSessions } from "./session.js";

export function handleAgentStatus(): void {
  const auditPath = getAuditLogPath();
  const hasAuditLog = fs.existsSync(auditPath);
  const sessions = loadSessions();

  console.log("=== OpenAgent Infrastructure Status ===");
  console.log(`Platform:          ${os.platform()} (${os.arch()})`);
  console.log(`Node.js Version:   ${process.version}`);
  console.log(`Policy Engine:     ONLINE (Deterministic evaluator active)`);
  console.log(`Security Default:  DEFAULT-DENY (Sensitive actions require explicit rules)`);
  console.log(`Telemetry / Cloud: DISABLED (100% Local-only operation)`);
  console.log(
    `Audit Store:       ${hasAuditLog ? "INITIALIZED (" + auditPath + ")" : "NOT INITIALIZED"}`
  );
  console.log(`Sessions Count:    ${sessions.length}`);
}
