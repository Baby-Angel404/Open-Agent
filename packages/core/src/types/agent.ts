import { AgentAction, ActionResult } from "./action.js";
import { PolicyDecision } from "./policy.js";

export type AgentStatus = "IDLE" | "RUNNING" | "PAUSED" | "STOPPED" | "ERROR";

export type SessionStatus =
  "CREATED" | "RUNNING" | "WAITING_FOR_APPROVAL" | "COMPLETED" | "FAILED" | "STOPPED";

export interface SessionHistoryEntry {
  step: number;
  action: AgentAction;
  decision: PolicyDecision;
  result?: ActionResult;
  timestamp: string;
}

export interface Agent {
  id: string;
  name: string;
  version: string;
  status: AgentStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  agentId: string;
  task: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  pendingAction?: AgentAction;
  history: SessionHistoryEntry[];
  metadata?: Record<string, unknown>;
}
