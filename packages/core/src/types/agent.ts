export type AgentStatus = "IDLE" | "RUNNING" | "PAUSED" | "STOPPED" | "ERROR";

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
  status: "ACTIVE" | "TERMINATED";
  startedAt: string;
  endedAt?: string;
  metadata?: Record<string, unknown>;
}
