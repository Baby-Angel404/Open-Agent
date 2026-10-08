import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import {
  AuditEvent,
  AuditLogEntry,
  AuditQueryFilter,
  AuditVerificationResult,
  ExportedAuditBundle,
  AuditRetentionConfig,
} from "../types/audit.js";
import { SecretRedactor, RedactionConfig } from "../security/redactor.js";

export const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Deterministically serialize a JSON value with alphabetically sorted keys
 * to ensure cryptographic hashing reproducibility across platforms.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalJson(item)).join(",") + "]";
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    "{" +
    keys
      .filter((k) => record[k] !== undefined)
      .map((k) => JSON.stringify(k) + ":" + canonicalJson(record[k]))
      .join(",") +
    "}"
  );
}

/**
 * Strip cryptographic and internal metadata fields prior to hashing.
 */
export function extractHashablePayload(entry: AuditLogEntry | AuditEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(entry)) {
    if (key !== "hash" && key !== "prev_hash" && key !== "sequence_number" && val !== undefined) {
      payload[key] = val;
    }
  }
  return payload;
}

export class AppendOnlyAuditStore {
  private logPath?: string;
  private entries: AuditLogEntry[] = [];
  private lastHash = GENESIS_HASH;
  private sequenceCounter = 0;
  private redactor: SecretRedactor;
  private retentionConfig: AuditRetentionConfig;
  private corruptedLineCount = 0;

  constructor(
    filePath?: string,
    redactionConfig?: RedactionConfig,
    retentionConfig?: AuditRetentionConfig
  ) {
    this.redactor = new SecretRedactor(redactionConfig);
    this.retentionConfig = retentionConfig || {};

    if (filePath) {
      this.logPath = filePath;
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.loadExistingLogs();
    }
  }

  getCorruptedLineCount(): number {
    return this.corruptedLineCount;
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
        if (entry.sequence_number && entry.sequence_number > this.sequenceCounter) {
          this.sequenceCounter = entry.sequence_number;
        } else {
          this.sequenceCounter++;
        }
      } catch {
        this.corruptedLineCount++;
      }
    }
  }

  append(rawEvent: AuditEvent): AuditLogEntry {
    const sanitizedEvent = this.redactor.redactObject(rawEvent) as AuditEvent;
    this.sequenceCounter++;

    const payloadToHash = extractHashablePayload(sanitizedEvent);
    const rawData = `${this.lastHash}:${canonicalJson(payloadToHash)}`;
    const hash = crypto.createHash("sha256").update(rawData).digest("hex");

    const entry: AuditLogEntry = {
      ...sanitizedEvent,
      sequence_number: this.sequenceCounter,
      prev_hash: this.lastHash,
      hash,
    };

    this.lastHash = hash;
    this.entries.push(entry);

    if (this.logPath) {
      fs.appendFileSync(this.logPath, JSON.stringify(entry) + "\n", { encoding: "utf-8" });
      this.checkRetention();
    }

    return entry;
  }

  getEntries(): AuditLogEntry[] {
    return [...this.entries];
  }

  getEntryCount(): number {
    return this.entries.length;
  }

  getLastHash(): string {
    return this.lastHash;
  }

  /**
   * Deterministically verifies hash-chain integrity.
   * Pinpoints exact index and event ID of any corrupted, deleted, reordered, or tampered record.
   */
  verifyIntegrity(
    customEntries?: AuditLogEntry[],
    initialPrevHash?: string
  ): AuditVerificationResult {
    const list = customEntries || this.entries;
    if (!customEntries && this.corruptedLineCount > 0) {
      return {
        valid: false,
        totalEntries: list.length,
        verifiedEntries: 0,
        reason: `Audit log file contains ${this.corruptedLineCount} corrupted or unparseable record(s)`,
      };
    }
    if (list.length === 0) {
      return { valid: true, totalEntries: 0, verifiedEntries: 0 };
    }
    let prev =
      initialPrevHash !== undefined
        ? initialPrevHash
        : customEntries
          ? customEntries[0].prev_hash
          : GENESIS_HASH;

    for (let i = 0; i < list.length; i++) {
      const entry = list[i];

      // Check sequence number continuity if present
      if (
        entry.sequence_number !== undefined &&
        entry.sequence_number !== i + 1 &&
        !customEntries
      ) {
        return {
          valid: false,
          totalEntries: list.length,
          verifiedEntries: i,
          brokenAtIndex: i,
          brokenAtEventId: entry.event_id,
          reason: `Sequence number discontinuity at index ${i}: expected ${i + 1}, found ${entry.sequence_number}`,
        };
      }

      // Check previous hash linkage
      if (entry.prev_hash !== prev) {
        return {
          valid: false,
          totalEntries: list.length,
          verifiedEntries: i,
          brokenAtIndex: i,
          brokenAtEventId: entry.event_id,
          reason: `Previous hash mismatch at index ${i}: expected ${prev}, found ${entry.prev_hash}`,
        };
      }

      // Check cryptographic hash computation
      const payloadToHash = extractHashablePayload(entry);
      const rawData = `${prev}:${canonicalJson(payloadToHash)}`;
      const expectedHash = crypto.createHash("sha256").update(rawData).digest("hex");

      let matches = expectedHash === entry.hash;
      if (!matches) {
        const legacyData = `${prev}:${JSON.stringify(payloadToHash)}`;
        const legacyHash = crypto.createHash("sha256").update(legacyData).digest("hex");
        if (legacyHash === entry.hash) {
          matches = true;
        }
      }

      if (!matches) {
        return {
          valid: false,
          totalEntries: list.length,
          verifiedEntries: i,
          brokenAtIndex: i,
          brokenAtEventId: entry.event_id,
          reason: `Hash integrity check failed at index ${i} (eventId: ${entry.event_id}): expected ${expectedHash}, found ${entry.hash}`,
        };
      }

      prev = entry.hash;
    }

    return {
      valid: true,
      totalEntries: list.length,
      verifiedEntries: list.length,
    };
  }

  /**
   * Structured query and free-text search across all stored audit events.
   */
  query(filter: AuditQueryFilter): AuditLogEntry[] {
    let result = [...this.entries];

    if (filter.sessionId) {
      result = result.filter((e) => e.session_id === filter.sessionId);
    }

    if (filter.agentId) {
      result = result.filter((e) => e.agent_id === filter.agentId);
    }

    if (filter.eventType) {
      const types = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType];
      result = result.filter(
        (e) =>
          (e.event_type && types.includes(e.event_type)) ||
          (e.stage && types.includes(e.stage as any))
      );
    }

    if (filter.severity) {
      const severities = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
      result = result.filter(
        (e) => e.security_metadata && severities.includes(e.security_metadata.severity)
      );
    }

    if (filter.startTime) {
      const startMs = Date.parse(filter.startTime);
      result = result.filter((e) => Date.parse(e.timestamp) >= startMs);
    }

    if (filter.endTime) {
      const endMs = Date.parse(filter.endTime);
      result = result.filter((e) => Date.parse(e.timestamp) <= endMs);
    }

    if (filter.textSearch) {
      const term = filter.textSearch.toLowerCase();
      result = result.filter((e) => {
        const textBlob = `${e.action || ""} ${e.target || ""} ${e.reason || ""} ${e.error || ""} ${
          e.security_metadata?.classification_reason || ""
        } ${JSON.stringify(e.metadata || {})} ${JSON.stringify(e.proposed_action || {})}`.toLowerCase();
        return textBlob.includes(term);
      });
    }

    const offset = filter.offset || 0;
    const limit = filter.limit !== undefined ? filter.limit : result.length;
    return result.slice(offset, offset + limit);
  }

  /**
   * Exports all audit records for a given session into a standalone, verifiable package.
   */
  exportSession(sessionId: string): ExportedAuditBundle {
    const sessionEntries = this.entries.filter((e) => e.session_id === sessionId);
    const rootHash = sessionEntries.length > 0 ? sessionEntries[0].prev_hash : GENESIS_HASH;
    const leafHash =
      sessionEntries.length > 0 ? sessionEntries[sessionEntries.length - 1].hash : GENESIS_HASH;

    const verification = this.verifyIntegrity(sessionEntries);

    return {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      sessionId,
      entries: sessionEntries,
      rootHash,
      leafHash,
      integrityValid: verification.valid,
    };
  }

  /**
   * Verifies an exported audit bundle independently.
   */
  static verifyBundle(bundle: ExportedAuditBundle): AuditVerificationResult {
    if (!bundle || !Array.isArray(bundle.entries)) {
      return {
        valid: false,
        totalEntries: 0,
        verifiedEntries: 0,
        reason: "Invalid bundle format: missing entries array",
      };
    }

    let prev = bundle.rootHash || GENESIS_HASH;
    for (let i = 0; i < bundle.entries.length; i++) {
      const entry = bundle.entries[i];

      if (entry.prev_hash !== prev) {
        return {
          valid: false,
          totalEntries: bundle.entries.length,
          verifiedEntries: i,
          brokenAtIndex: i,
          brokenAtEventId: entry.event_id,
          reason: `Previous hash mismatch in bundle at index ${i}: expected ${prev}, found ${entry.prev_hash}`,
        };
      }

      const payloadToHash = extractHashablePayload(entry);
      const rawData = `${prev}:${canonicalJson(payloadToHash)}`;
      const expectedHash = crypto.createHash("sha256").update(rawData).digest("hex");

      let matches = expectedHash === entry.hash;
      if (!matches) {
        const legacyData = `${prev}:${JSON.stringify(payloadToHash)}`;
        const legacyHash = crypto.createHash("sha256").update(legacyData).digest("hex");
        if (legacyHash === entry.hash) {
          matches = true;
        }
      }

      if (!matches) {
        return {
          valid: false,
          totalEntries: bundle.entries.length,
          verifiedEntries: i,
          brokenAtIndex: i,
          brokenAtEventId: entry.event_id,
          reason: `Hash integrity check failed in bundle at index ${i} (eventId: ${entry.event_id})`,
        };
      }

      prev = entry.hash;
    }

    return {
      valid: true,
      totalEntries: bundle.entries.length,
      verifiedEntries: bundle.entries.length,
    };
  }

  /**
   * Applies log retention and rotation according to configuration.
   */
  applyRetention(config?: AuditRetentionConfig): {
    rotated: boolean;
    archivedPath?: string;
    deletedCount?: number;
  } {
    const activeConfig = config || this.retentionConfig;
    if (!this.logPath || !fs.existsSync(this.logPath)) {
      return { rotated: false };
    }

    let shouldRotate = false;
    const stats = fs.statSync(this.logPath);

    if (activeConfig.maxFileSizeBytes && stats.size > activeConfig.maxFileSizeBytes) {
      shouldRotate = true;
    }

    if (activeConfig.maxAgeDays && this.entries.length > 0) {
      const oldestTimestamp = Date.parse(this.entries[0].timestamp);
      const maxAgeMs = activeConfig.maxAgeDays * 24 * 60 * 60 * 1000;
      if (Date.now() - oldestTimestamp > maxAgeMs) {
        shouldRotate = true;
      }
    }

    if (shouldRotate) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = path.extname(this.logPath);
      const base = this.logPath.slice(0, -ext.length);
      const archivedPath = `${base}.${timestamp}.archive${ext}`;

      fs.renameSync(this.logPath, archivedPath);

      // Re-initialize current file preserving last hash as genesis anchor
      fs.writeFileSync(this.logPath, "", { encoding: "utf-8" });

      return {
        rotated: true,
        archivedPath,
      };
    }

    return { rotated: false };
  }

  private checkRetention(): void {
    if (this.retentionConfig.maxFileSizeBytes || this.retentionConfig.maxAgeDays) {
      this.applyRetention();
    }
  }
}
