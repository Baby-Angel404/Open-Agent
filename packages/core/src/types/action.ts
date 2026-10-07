export type ActionCategory = "SAFE" | "SENSITIVE" | "DESTRUCTIVE";

export interface AgentAction {
  id?: string;
  type: string;
  target?: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
  isSensitive?: boolean;
}

export interface ActionResult {
  actionId?: string;
  status: "SUCCESS" | "FAILURE" | "BLOCKED";
  output?: unknown;
  error?: string;
  executedAt: string;
}
