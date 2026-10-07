import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { AuditEvent, AuditLogEntry } from "../types/audit.js";

export class LocalAuditLogger {
  private logPath?: string;
  private entries: AuditLogEntry[] = [];
  private lastHash = "0000000000000000000000000000000000000000000000000000000000000000";

  constructor(filePath?: string) {
    if (filePath) {
      this.logPath = filePath;
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.loadExistingLogs();
    }
  }

  private loadExistingLogs(): void {
    if (!this.logPath || !fs.existsSync(this.logPath)) {
      return;
    }
    const lines = fs.readFileSync(this.logPath, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as AuditLogEntry;
        this.entries.push(entry);
        this.lastHash = entry.hash;
      } catch {
        // Skip corrupted line
      }
    }
  }

  append(event: AuditEvent): AuditLogEntry {
    const rawData = `${this.lastHash}:${JSON.stringify(event)}`;
    const hash = crypto.createHash("sha256").update(rawData).digest("hex");

    const entry: AuditLogEntry = {
      ...event,
      hash,
      prev_hash: this.lastHash,
    };

    this.lastHash = hash;
    this.entries.push(entry);

    if (this.logPath) {
      fs.appendFileSync(this.logPath, JSON.stringify(entry) + "\n", { encoding: "utf-8" });
    }

    return entry;
  }

  getEntries(): AuditLogEntry[] {
    return [...this.entries];
  }

  verifyIntegrity(): boolean {
    let prev = "0000000000000000000000000000000000000000000000000000000000000000";
    for (const entry of this.entries) {
      if (entry.prev_hash !== prev) {
        return false;
      }
      const rawData = `${prev}:${JSON.stringify({
        event_id: entry.event_id,
        session_id: entry.session_id,
        timestamp: entry.timestamp,
        action: entry.action,
        target: entry.target,
        policy_decision: entry.policy_decision,
        reason: entry.reason,
        result: entry.result,
        metadata: entry.metadata,
      })}`;
      const expectedHash = crypto.createHash("sha256").update(rawData).digest("hex");
      if (expectedHash !== entry.hash) {
        return false;
      }
      prev = entry.hash;
    }
    return true;
  }
}
