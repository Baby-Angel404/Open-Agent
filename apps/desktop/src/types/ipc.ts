import type { DesktopSettings } from "./settings.js";

export type IPCResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// System
export interface SystemStatusData {
  running: boolean;
  version: string;
  uptimeSeconds: number;
  subsystems: {
    runtime: boolean;
    vector: boolean;
    graph: boolean;
    network: boolean;
    audit: boolean;
    gateway: boolean;
  };
  metrics: {
    activeSessions: number;
    auditEventsCount: number;
    vectorDocumentCount: number;
    graphEntitiesCount: number;
    knownPeersCount: number;
  };
  loopbackGatewayUrl?: string;
}

// Session & Agent
export interface CreateSessionParams {
  agentId: string;
  goal: string;
  context?: Record<string, unknown>;
}

export interface RunTaskParams {
  sessionId: string;
  task: string;
}

export interface ReviewApprovalParams {
  sessionId: string;
  approvalId: string;
  approved: boolean;
  reason?: string;
}

export interface SessionSummary {
  id: string;
  agentId: string;
  status: "idle" | "running" | "paused" | "awaiting_approval" | "completed" | "failed";
  goal: string;
  createdAt: number;
  updatedAt: number;
  eventsCount: number;
}

// Browser Agent
export interface BrowserNavigateParams {
  sessionId: string;
  url: string;
}

export interface BrowserActionParams {
  sessionId: string;
  action: "click" | "type" | "scroll" | "screenshot" | "extract_text";
  selector?: string;
  text?: string;
}

// Knowledge & RAG
export interface IngestDocumentParams {
  title: string;
  content: string;
  contentType?: "text/plain" | "text/markdown";
  tags?: string[];
}

export interface QueryRAGParams {
  query: string;
  limit?: number;
  mode?: "hybrid" | "vector_only" | "graph_only";
}

export interface GraphQueryData {
  entities: Array<{ id: string; name: string; type: string }>;
  relations: Array<{ sourceId: string; targetId: string; relationType: string }>;
}

// Network
export interface NetworkStatusData {
  nodeId: string;
  nodeName: string;
  listenPort: number;
  connectedPeers: number;
  advertisedCapabilities: string[];
}

export interface InvokeRemoteCapabilityParams {
  peerId: string;
  capabilityName: string;
  params: Record<string, unknown>;
}

// Plugins
export interface RegisterCapabilityParams {
  name: string;
  version: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
}

// Credential Vault
export interface SetSecretParams {
  key: string;
  secret: string;
}

// Backup & Restore
export interface CreateBackupParams {
  destinationPath: string;
  includeAuditLogs: boolean;
  includeKnowledgeBase: boolean;
}

export interface RestoreBackupParams {
  backupFilePath: string;
  overwriteExisting: boolean;
}

export interface BackupVerificationData {
  valid: boolean;
  manifest: {
    version: string;
    createdAt: string;
    subsystems: string[];
    checksum: string;
  };
}

// Channel Names Mapping
export const IPC_CHANNELS = {
  // System
  SYSTEM_GET_STATUS: "system:getStatus",
  SYSTEM_RESTART: "system:restart",
  SYSTEM_SHUTDOWN: "system:shutdown",

  // Session / Runtime
  SESSION_CREATE: "session:create",
  SESSION_RUN_TASK: "session:runTask",
  SESSION_LIST: "session:list",
  SESSION_STOP: "session:stop",
  SESSION_GET_HISTORY: "session:getHistory",
  SESSION_REVIEW_APPROVAL: "session:reviewApproval",

  // Browser Agent
  BROWSER_NAVIGATE: "browser:navigate",
  BROWSER_ACTION: "browser:action",
  BROWSER_GET_STATUS: "browser:getStatus",

  // Knowledge & RAG
  RAG_INGEST: "rag:ingest",
  RAG_QUERY: "rag:query",
  RAG_GET_GRAPH: "rag:getGraph",

  // Network
  NETWORK_GET_STATUS: "network:getStatus",
  NETWORK_DISCOVER_PEERS: "network:discoverPeers",
  NETWORK_INVOKE_REMOTE: "network:invokeRemote",

  // Plugins
  PLUGINS_LIST: "plugins:list",
  PLUGINS_REGISTER: "plugins:register",

  // Settings & Vault
  SETTINGS_GET: "settings:get",
  SETTINGS_SAVE: "settings:save",
  VAULT_SET_SECRET: "vault:setSecret",
  VAULT_HAS_SECRET: "vault:hasSecret",
  VAULT_DELETE_SECRET: "vault:deleteSecret",

  // Backup & Restore
  BACKUP_CREATE: "backup:create",
  BACKUP_VERIFY: "backup:verify",
  BACKUP_RESTORE: "backup:restore",

  // Push Events Main -> Renderer
  ON_SESSION_EVENT: "event:session",
  ON_SYSTEM_LOG: "event:log",
  ON_APPROVAL_REQUESTED: "event:approvalRequested",
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
