export type StandardActionType =
  "navigate" | "read" | "click" | "type" | "select" | "download" | "upload" | "submit";

export type ActionType = StandardActionType | (string & {});

export type ActionCategory = "SAFE" | "SENSITIVE" | "DESTRUCTIVE";

export interface AgentAction {
  id?: string;
  sessionId?: string;
  type: ActionType;
  target?: string;
  parameters?: Record<string, unknown>;
  timestamp?: string;
  agentId?: string;
  isSensitive?: boolean;
  // Backwards compatibility alias for parameters
  payload?: Record<string, unknown>;
}

export interface ActionResult {
  actionId?: string;
  status: "SUCCESS" | "FAILURE" | "BLOCKED";
  output?: unknown;
  error?: string;
  executedAt: string;
}
