import { DecisionType } from "./policy.js";

export interface AuditEvent {
  event_id: string;
  session_id: string;
  timestamp: string;
  action: string;
  target?: string;
  policy_decision: DecisionType;
  reason?: string;
  result: "success" | "failure" | "blocked";
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntry extends AuditEvent {
  hash: string;
  prev_hash: string;
}
