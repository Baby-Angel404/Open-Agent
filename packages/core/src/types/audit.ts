import { DecisionType } from "./policy.js";

export type AuditEventType =
  | "SESSION_CREATED"
  | "TASK_RECEIVED"
  | "ACTION_PROPOSED"
  | "POLICY_EVALUATED"
  | "USER_APPROVAL_REQUESTED"
  | "USER_APPROVED"
  | "USER_DENIED"
  | "ACTION_EXECUTED"
  | "ACTION_FAILED"
  | "ACTION_BLOCKED"
  | "SESSION_STOPPED"
  | "SESSION_COMPLETED"
  | "GRAPH_DOCUMENT_INGESTED"
  | "GRAPH_ENTITY_CREATED"
  | "GRAPH_ENTITY_UPDATED"
  | "GRAPH_ENTITY_DELETED"
  | "GRAPH_RELATIONSHIP_CREATED"
  | "GRAPH_RELATIONSHIP_UPDATED"
  | "GRAPH_RELATIONSHIP_DELETED"
  | "GRAPH_QUERY_EXECUTED"
  | "GRAPH_TRAVERSAL_EXECUTED"
  | "RAG_QUERY_EXECUTED"
  | "RAG_GRAPH_EXPANSION"
  | "RAG_CONTEXT_ASSEMBLED"
  | "PEER_DISCOVERED"
  | "PEER_CONNECTED"
  | "PEER_DISCONNECTED"
  | "HANDSHAKE_STARTED"
  | "HANDSHAKE_FAILED"
  | "HANDSHAKE_COMPLETED"
  | "MESSAGE_RECEIVED"
  | "MESSAGE_REJECTED"
  | "CAPABILITY_DISCOVERED"
  | "CAPABILITY_INVOCATION_REQUESTED"
  | "CAPABILITY_INVOCATION_ALLOWED"
  | "CAPABILITY_INVOCATION_DENIED"
  | "CAPABILITY_EXECUTION_STARTED"
  | "CAPABILITY_EXECUTION_COMPLETED"
  | "CAPABILITY_EXECUTION_FAILED"
  | "PEER_BLOCKED"
  | "PEER_UNBLOCKED"
  | "REPUTATION_CHANGED"
  | "DATA_TRANSFER_ALLOWED"
  | "DATA_TRANSFER_DENIED";

// Backwards compatibility alias for Phase 1
export type AuditEventStage =
  | AuditEventType
  | "ACTION_ALLOWED"
  | "ACTION_DENIED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_REJECTED";

export type SecuritySeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SecurityMetadata {
  severity: SecuritySeverity;
  category?: string;
  rule_id?: string;
  alert?: boolean;
  classification_reason?: string;
  indicators?: string[];
}

export interface TargetMetadata {
  url?: string;
  domain?: string;
  resource?: string;
  safe_attributes?: Record<string, unknown>;
}

export interface AuditEvent {
  event_id: string;
  session_id: string;
  agent_id?: string;
  timestamp: string;
  event_type?: AuditEventType;
  stage?: AuditEventStage; // Backwards compatibility alias
  action?: string;
  action_id?: string;
  policy_decision?: DecisionType;
  reason?: string;
  target?: string;
  target_metadata?: TargetMetadata;
  result?: "success" | "failure" | "blocked" | "pending";
  error?: string;
  security_metadata?: SecurityMetadata;
  proposed_action?: Record<string, unknown>;
  execution_result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntry extends AuditEvent {
  hash: string;
  prev_hash: string;
  sequence_number?: number;
}

export interface AuditQueryFilter {
  sessionId?: string;
  agentId?: string;
  eventType?: AuditEventType | AuditEventType[];
  severity?: SecuritySeverity | SecuritySeverity[];
  startTime?: string;
  endTime?: string;
  textSearch?: string;
  limit?: number;
  offset?: number;
}

export interface AuditVerificationResult {
  valid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  brokenAtIndex?: number;
  brokenAtEventId?: string;
  reason?: string;
}

export interface ExportedAuditBundle {
  version: string;
  exportedAt: string;
  sessionId: string;
  entries: AuditLogEntry[];
  rootHash: string;
  leafHash: string;
  integrityValid: boolean;
}

export interface AuditRetentionConfig {
  maxFileSizeBytes?: number;
  maxAgeDays?: number;
}
