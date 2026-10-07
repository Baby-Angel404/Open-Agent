import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { AuditEvent, AuditLogEntry } from "../types/audit.js";
import { SecretRedactor, RedactionConfig } from "../security/redactor.js";

export class LocalAuditLogger {
  private logPath?: string;
  private entries: AuditLogEntry[] = [];
  private lastHash = "0000000000000000000000000000000000000000000000000000000000000000";
  private redactor: SecretRedactor;

  constructor(filePath?: string, redactionConfig?: RedactionConfig) {
    this.redactor = new SecretRedactor(redactionConfig);
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

  append(rawEvent: AuditEvent): AuditLogEntry {
    // Redact all sensitive fields/credentials before hashing and saving
    const sanitizedEvent = this.redactor.redactObject(rawEvent);

    const rawData = `${this.lastHash}:${JSON.stringify(sanitizedEvent)}`;
    const hash = crypto.createHash("sha256").update(rawData).digest("hex");

    const entry: AuditLogEntry = {
      ...sanitizedEvent,
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
      const eventToHash = {
        event_id: entry.event_id,
        session_id: entry.session_id,
        timestamp: entry.timestamp,
        stage: entry.stage,
        action: entry.action,
        target: entry.target,
        policy_decision: entry.policy_decision,
        reason: entry.reason,
        result: entry.result,
        error: entry.error,
        proposed_action: entry.proposed_action,
        execution_result: entry.execution_result,
        metadata: entry.metadata,
      };
      const rawData = `${prev}:${JSON.stringify(eventToHash)}`;
      const expectedHash = crypto.createHash("sha256").update(rawData).digest("hex");
      if (expectedHash !== entry.hash) {
        return false;
      }
      prev = entry.hash;
    }
    return true;
  }
}
