import * as path from "node:path";
import { promises as fs } from "node:fs";
import {
  AgentRuntime,
  AppendOnlyAuditStore,
  LocalAPIServer,
  PolicyEngine,
  CapabilityRegistry as CoreCapabilityRegistry,
  ExecutorDispatcher,
  ScriptedPlanProvider,
  Policy,
} from "@open-agent/core";
import { VectorEngine, FileSystemStorageBackend } from "@open-agent/vector";
import { FileSystemGraphStorage, GraphRAGEngine } from "@open-agent/graph";
import { NetworkNode, NetworkAPIHandler } from "@open-agent/network";
import { CredentialVault } from "./vault.js";
import { BackupEngine } from "./backup.js";
import { DesktopSettings, DEFAULT_DESKTOP_SETTINGS } from "../types/settings.js";
import { SystemStatusData } from "../types/ipc.js";

const DEFAULT_RUNTIME_POLICY: Policy = {
  id: "policy-desktop-default",
  name: "Desktop Local Policy",
  version: "1.0.0",
  defaultDecision: "ALLOW",
  rules: [
    {
      id: "rule-allow-safe-browse",
      actionType: "NAVIGATE",
      decision: "ALLOW",
      description: "Allow web navigation",
    },
    {
      id: "rule-ask-system-call",
      actionType: "EXECUTE_TOOL",
      decision: "ALLOW",
      description: "Allow tool execution",
    },
  ],
};

export class SubsystemLifecycle {
  private baseDir: string;
  private settings: DesktopSettings;
  private vault?: CredentialVault;
  private backupEngine?: BackupEngine;

  private auditStore?: AppendOnlyAuditStore;
  private policyEngine?: PolicyEngine;
  private agentRuntime?: AgentRuntime;
  private vectorEngine?: VectorEngine;
  private graphStorage?: FileSystemGraphStorage;
  private ragEngine?: GraphRAGEngine;
  private networkNode?: NetworkNode;
  private apiServer?: LocalAPIServer;

  private isRunning = false;
  private startedAt = 0;
  private actualApiPort = 0;

  constructor(baseDir: string, customSettings?: Partial<DesktopSettings>) {
    this.baseDir = path.resolve(baseDir);
    this.settings = {
      ...DEFAULT_DESKTOP_SETTINGS,
      ...customSettings,
      storage: {
        dataDirectory: path.join(this.baseDir, "data"),
        vectorStoreDirectory: path.join(this.baseDir, "data", "vector"),
        graphStoreDirectory: path.join(this.baseDir, "data", "graph"),
        auditStoreDirectory: path.join(this.baseDir, "data", "audit"),
        ...(customSettings?.storage || {}),
      },
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    // 1. Ensure directory structures
    const dirs = [
      this.baseDir,
      this.settings.storage.dataDirectory,
      this.settings.storage.vectorStoreDirectory,
      this.settings.storage.graphStoreDirectory,
      this.settings.storage.auditStoreDirectory,
      path.join(this.baseDir, "vault"),
    ];
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    // 2. Initialize Vault and Backup Engine
    this.vault = new CredentialVault(path.join(this.baseDir, "vault"));
    await this.vault.initialize();
    this.backupEngine = new BackupEngine(this.settings.storage.dataDirectory);

    // 3. Initialize Audit Store & Policy
    const auditFilePath = path.join(this.settings.storage.auditStoreDirectory, "audit.jsonl");
    this.auditStore = new AppendOnlyAuditStore(auditFilePath);

    this.policyEngine = new PolicyEngine();

    // 4. Initialize Core Runtime
    const coreCapabilityRegistry = new CoreCapabilityRegistry();
    const dispatcher = new ExecutorDispatcher("desktop-secret-token", true);
    const llmProvider = new ScriptedPlanProvider();

    this.agentRuntime = new AgentRuntime({
      policyEngine: this.policyEngine,
      policy: DEFAULT_RUNTIME_POLICY,
      dispatcher,
      capabilityRegistry: coreCapabilityRegistry,
      auditLogger: this.auditStore,
      llmProvider,
    });

    // 5. Initialize Vector Engine
    const vectorBackend = new FileSystemStorageBackend(this.settings.storage.vectorStoreDirectory);
    this.vectorEngine = new VectorEngine({
      storage: vectorBackend,
    });
    await this.vectorEngine.init();

    // 6. Initialize Graph & Graph RAG
    this.graphStorage = new FileSystemGraphStorage(this.settings.storage.graphStoreDirectory);
    await this.graphStorage.load();

    this.ragEngine = new GraphRAGEngine({
      storage: this.graphStorage,
      vectorEngine: this.vectorEngine,
    });

    // 7. Initialize Decentralized Network Node
    const networkDataDir = path.join(this.settings.storage.dataDirectory, "network");
    await fs.mkdir(networkDataDir, { recursive: true });

    this.networkNode = new NetworkNode({
      storageDir: networkDataDir,
      policy: DEFAULT_RUNTIME_POLICY,
      policyEngine: this.policyEngine,
      auditStore: this.auditStore,
    });
    await this.networkNode.start();

    // 8. Initialize Loopback API Server & Gateway
    const networkHandler = new NetworkAPIHandler(this.networkNode);
    this.apiServer = new LocalAPIServer({
      runtime: this.agentRuntime,
      auditLogger: this.auditStore,
      vectorEngine: this.vectorEngine,
      graphStorage: this.graphStorage,
      ragEngine: this.ragEngine,
      networkHandler,
      host: "127.0.0.1",
      port: 0,
      enableDashboard: true,
    });

    this.actualApiPort = await this.apiServer.listen(0);
    this.startedAt = Date.now();
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    if (this.apiServer) {
      await this.apiServer.close();
      this.apiServer = undefined;
    }

    if (this.networkNode) {
      await this.networkNode.stop();
      this.networkNode = undefined;
    }

    if (this.vectorEngine) {
      await this.vectorEngine.close();
      this.vectorEngine = undefined;
    }

    if (this.graphStorage) {
      await this.graphStorage.close();
      this.graphStorage = undefined;
    }

    this.isRunning = false;
  }

  getStatus(): SystemStatusData {
    const uptime = this.startedAt > 0 ? Math.floor((Date.now() - this.startedAt) / 1000) : 0;
    const sessionCount = this.agentRuntime ? this.agentRuntime.listSessions().length : 0;
    const auditCount = this.auditStore ? this.auditStore.getEntries().length : 0;
    const entitiesCount = this.graphStorage ? this.graphStorage.listEntities().length : 0;
    const peersCount = this.networkNode ? this.networkNode.getPeerManager().listPeers().length : 0;

    return {
      running: this.isRunning,
      version: "0.1.0",
      uptimeSeconds: uptime,
      subsystems: {
        runtime: !!this.agentRuntime,
        vector: !!this.vectorEngine,
        graph: !!this.graphStorage,
        network: !!this.networkNode,
        audit: !!this.auditStore,
        gateway: !!this.apiServer,
      },
      metrics: {
        activeSessions: sessionCount,
        auditEventsCount: auditCount,
        vectorDocumentCount: 0,
        graphEntitiesCount: entitiesCount,
        knownPeersCount: peersCount,
      },
      loopbackGatewayUrl: this.isRunning ? `http://127.0.0.1:${this.actualApiPort}` : undefined,
    };
  }

  getAgentRuntime(): AgentRuntime | undefined {
    return this.agentRuntime;
  }

  getAuditStore(): AppendOnlyAuditStore | undefined {
    return this.auditStore;
  }

  getPolicyEngine(): PolicyEngine | undefined {
    return this.policyEngine;
  }

  getVectorEngine(): VectorEngine | undefined {
    return this.vectorEngine;
  }

  getGraphStorage(): FileSystemGraphStorage | undefined {
    return this.graphStorage;
  }

  getRagEngine(): GraphRAGEngine | undefined {
    return this.ragEngine;
  }

  getNetworkNode(): NetworkNode | undefined {
    return this.networkNode;
  }

  getVault(): CredentialVault | undefined {
    return this.vault;
  }

  getBackupEngine(): BackupEngine | undefined {
    return this.backupEngine;
  }

  getApiPort(): number {
    return this.actualApiPort;
  }

  getSettings(): DesktopSettings {
    return this.settings;
  }

  async updateSettings(newSettings: Partial<DesktopSettings>): Promise<DesktopSettings> {
    this.settings = {
      ...this.settings,
      ...newSettings,
      general: { ...this.settings.general, ...(newSettings.general || {}) },
      security: { ...this.settings.security, ...(newSettings.security || {}) },
      storage: { ...this.settings.storage, ...(newSettings.storage || {}) },
      network: { ...this.settings.network, ...(newSettings.network || {}) },
    };
    const settingsPath = path.join(this.baseDir, "settings.json");
    await fs.writeFile(settingsPath, JSON.stringify(this.settings, null, 2), "utf-8");
    return this.settings;
  }
}
