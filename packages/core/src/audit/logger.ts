import {
  AuditEvent,
  AuditLogEntry,
  AuditQueryFilter,
  AuditVerificationResult,
  ExportedAuditBundle,
  AuditRetentionConfig,
} from "../types/audit.js";
import { RedactionConfig } from "../security/redactor.js";
import { AppendOnlyAuditStore } from "./store.js";

export class LocalAuditLogger {
  private store: AppendOnlyAuditStore;

  constructor(
    filePath?: string,
    redactionConfig?: RedactionConfig,
    retentionConfig?: AuditRetentionConfig
  ) {
    this.store = new AppendOnlyAuditStore(filePath, redactionConfig, retentionConfig);
  }

  append(rawEvent: AuditEvent): AuditLogEntry {
    return this.store.append(rawEvent);
  }

  getEntries(): AuditLogEntry[] {
    return this.store.getEntries();
  }

  getEntryCount(): number {
    return this.store.getEntryCount();
  }

  getLastHash(): string {
    return this.store.getLastHash();
  }

  verifyIntegrity(): boolean {
    return this.store.verifyIntegrity().valid;
  }

  verify(): AuditVerificationResult {
    return this.store.verifyIntegrity();
  }

  query(filter: AuditQueryFilter): AuditLogEntry[] {
    return this.store.query(filter);
  }

  exportSession(sessionId: string): ExportedAuditBundle {
    return this.store.exportSession(sessionId);
  }

  getStore(): AppendOnlyAuditStore {
    return this.store;
  }
}
