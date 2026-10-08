import { SubsystemLifecycle } from "../lifecycle.js";
import { IPCResponse, IPC_CHANNELS } from "../../types/ipc.js";
import { handleSystemStatus, handleSystemShutdown } from "./handlers/system.handler.js";
import {
  handleListSessions,
  handleCreateSession,
  handleRunTask,
  handleReviewApproval,
  handleGetHistory,
  handleStopSession,
} from "./handlers/session.handler.js";
import {
  handleBrowserNavigate,
  handleBrowserAction,
  handleBrowserStatus,
} from "./handlers/browser.handler.js";
import { handleRagIngest, handleRagQuery, handleRagGetGraph } from "./handlers/rag.handler.js";
import {
  handleNetworkStatus,
  handleDiscoverPeers,
  handleInvokeRemote,
} from "./handlers/network.handler.js";
import { handleListCapabilities, handleRegisterCapability } from "./handlers/plugin.handler.js";
import {
  handleGetSettings,
  handleSaveSettings,
  handleVaultSetSecret,
  handleVaultHasSecret,
  handleVaultDeleteSecret,
} from "./handlers/settings.handler.js";
import {
  handleCreateBackup,
  handleVerifyBackup,
  handleRestoreBackup,
} from "./handlers/backup.handler.js";

export class IPCDispatcher {
  private lifecycle: SubsystemLifecycle;

  constructor(lifecycle: SubsystemLifecycle) {
    this.lifecycle = lifecycle;
  }

  async dispatch(channel: string, payload?: unknown): Promise<IPCResponse<unknown>> {
    try {
      switch (channel) {
        // System
        case IPC_CHANNELS.SYSTEM_GET_STATUS:
          return handleSystemStatus(this.lifecycle);
        case IPC_CHANNELS.SYSTEM_SHUTDOWN:
          return await handleSystemShutdown(this.lifecycle);

        // Session / Runtime
        case IPC_CHANNELS.SESSION_LIST:
          return handleListSessions(this.lifecycle);
        case IPC_CHANNELS.SESSION_CREATE:
          return handleCreateSession(this.lifecycle, payload as any);
        case IPC_CHANNELS.SESSION_RUN_TASK:
          return await handleRunTask(this.lifecycle, payload as any);
        case IPC_CHANNELS.SESSION_REVIEW_APPROVAL:
          return await handleReviewApproval(this.lifecycle, payload as any);
        case IPC_CHANNELS.SESSION_GET_HISTORY:
          return handleGetHistory(this.lifecycle, payload as any);
        case IPC_CHANNELS.SESSION_STOP:
          return handleStopSession(this.lifecycle, payload as any);

        // Browser Agent
        case IPC_CHANNELS.BROWSER_NAVIGATE:
          return await handleBrowserNavigate(this.lifecycle, payload as any);
        case IPC_CHANNELS.BROWSER_ACTION:
          return await handleBrowserAction(this.lifecycle, payload as any);
        case IPC_CHANNELS.BROWSER_GET_STATUS:
          return handleBrowserStatus();

        // Knowledge & RAG
        case IPC_CHANNELS.RAG_INGEST:
          return await handleRagIngest(this.lifecycle, payload as any);
        case IPC_CHANNELS.RAG_QUERY:
          return await handleRagQuery(this.lifecycle, payload as any);
        case IPC_CHANNELS.RAG_GET_GRAPH:
          return handleRagGetGraph(this.lifecycle);

        // Network
        case IPC_CHANNELS.NETWORK_GET_STATUS:
          return handleNetworkStatus(this.lifecycle);
        case IPC_CHANNELS.NETWORK_DISCOVER_PEERS:
          return handleDiscoverPeers(this.lifecycle);
        case IPC_CHANNELS.NETWORK_INVOKE_REMOTE:
          return await handleInvokeRemote(this.lifecycle, payload as any);

        // Plugins
        case IPC_CHANNELS.PLUGINS_LIST:
          return handleListCapabilities(this.lifecycle);
        case IPC_CHANNELS.PLUGINS_REGISTER:
          return handleRegisterCapability(this.lifecycle, payload as any);

        // Settings & Vault
        case IPC_CHANNELS.SETTINGS_GET:
          return handleGetSettings(this.lifecycle);
        case IPC_CHANNELS.SETTINGS_SAVE:
          return await handleSaveSettings(this.lifecycle, payload as any);
        case IPC_CHANNELS.VAULT_SET_SECRET:
          return await handleVaultSetSecret(this.lifecycle, payload as any);
        case IPC_CHANNELS.VAULT_HAS_SECRET:
          return await handleVaultHasSecret(this.lifecycle, payload as any);
        case IPC_CHANNELS.VAULT_DELETE_SECRET:
          return await handleVaultDeleteSecret(this.lifecycle, payload as any);

        // Backup
        case IPC_CHANNELS.BACKUP_CREATE:
          return await handleCreateBackup(this.lifecycle, payload as any);
        case IPC_CHANNELS.BACKUP_VERIFY:
          return await handleVerifyBackup(this.lifecycle, payload as any);
        case IPC_CHANNELS.BACKUP_RESTORE:
          return await handleRestoreBackup(this.lifecycle, payload as any);

        default:
          return {
            success: false,
            error: {
              code: "UNKNOWN_CHANNEL",
              message: `Unknown or disallowed IPC channel: ${channel}`,
            },
          };
      }
    } catch (err: unknown) {
      // Redact internal error traces
      const msg = err instanceof Error ? err.message : "Internal error occurred";
      return {
        success: false,
        error: {
          code: "IPC_INTERNAL_ERROR",
          message: msg,
        },
      };
    }
  }
}
