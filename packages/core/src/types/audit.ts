import { DecisionType } from "./policy.js";

export type AuditEventStage =
  | "ACTION_PROPOSED"
  | "POLICY_EVALUATED"
  | "ACTION_ALLOWED"
  | "ACTION_DENIED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_REJECTED"
  | "ACTION_EXECUTED"
  | "ACTION_FAILED"
  | "SESSION_STOPPED";

export interface AuditEvent {
  event_id: string;
  session_id: string;
  timestamp: string;
  stage?: AuditEventStage;
  action: string;
  target?: string;
  policy_decision?: DecisionType;
  reason?: string;
  result?: "success" | "failure" | "blocked" | "pending";
  error?: string;
  proposed_action?: Record<string, unknown>;
  execution_result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntry extends AuditEvent {
  hash: string;
  prev_hash: string;
}
