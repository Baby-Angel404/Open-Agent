import {
  AgentKeyPair,
  AgentIdentity,
  Peer,
  Capability,
  CapabilityResponse,
  NetworkLimits,
  DataClassification,
} from "../types/index.js";
import { Policy, PolicyEngine, AppendOnlyAuditStore } from "@open-agent/core";
import { IdentityManager } from "../identity/identity-manager.js";
import { CapabilityRegistry } from "../capabilities/capability-registry.js";
import { PeerManager } from "../discovery/peer-manager.js";
import { ReputationManager } from "../reputation/reputation-manager.js";
import { ResourceGuard } from "../guards/resource-guard.js";
import { ITransport, LocalDirectTransport } from "../transport/transport.js";
import {
  CapabilityInvocationHandler,
  CapabilityExecutorFn,
} from "../invocation/invocation-handler.js";
import { DistributedRAGClient } from "../rag/distributed-rag.js";
import { NetworkStorage } from "../storage/network-storage.js";

export interface NetworkNodeOptions {
  storageDir?: string;
  isDevelopment?: boolean;
  keyPair?: AgentKeyPair;
  policy?: Policy;
  policyEngine?: PolicyEngine;
  transport?: ITransport;
  limits?: Partial<NetworkLimits>;
  auditStore?: AppendOnlyAuditStore;
}

export interface NetworkNodeStatus {
  agent_id: string;
  public_key: string;
  algorithm: string;
  transport_status: string;
  peers_count: number;
  capabilities_count: number;
  blocked_peers_count: number;
  reputation_records_count: number;
}

export class NetworkNode {
  private keyPair: AgentKeyPair;
  private policy: Policy;
  private policyEngine: PolicyEngine;
  private peerManager: PeerManager;
  private capabilityRegistry: CapabilityRegistry;
  private reputationManager: ReputationManager;
  private resourceGuard: ResourceGuard;
  private transport: ITransport;
  private invocationHandler: CapabilityInvocationHandler;
  private distributedRAG: DistributedRAGClient;
  private storage: NetworkStorage;
  private auditStore?: AppendOnlyAuditStore;
  private isStarted = false;

  constructor(options: NetworkNodeOptions = {}) {
    const storageDir = options.storageDir || ".network-store";
    this.storage = new NetworkStorage(storageDir);

    this.keyPair =
      options.keyPair ||
      IdentityManager.loadOrCreateIdentity(storageDir, options.isDevelopment !== false);

    this.policy = options.policy || {
      id: "policy_default_network",
      name: "Default Network Policy",
      version: "1.0.0",
      defaultDecision: "ALLOW",
      rules: [
        {
          id: "rule_deny_remote_exec",
          actionType: "remote_execution",
          decision: "DENY",
          description: "Deny all remote arbitrary code execution",
        },
        {
          id: "rule_allow_remote_read",
          actionType: "REMOTE_READ",
          decision: "ALLOW",
          description: "Allow reading standard capabilities",
        },
        {
          id: "rule_allow_cap_invocation",
          actionType: "CAPABILITY_INVOCATION",
          decision: "ALLOW",
          description: "Allow invoking registered capabilities",
        },
        {
          id: "rule_allow_data_transfer",
          actionType: "DATA_TRANSFER",
          decision: "ALLOW",
          description: "Allow public data transfer",
        },
      ],
    };

    this.policyEngine = options.policyEngine || new PolicyEngine();
    this.peerManager = new PeerManager();
    this.capabilityRegistry = new CapabilityRegistry();
    this.reputationManager = new ReputationManager();
    this.resourceGuard = new ResourceGuard(options.limits);
    this.auditStore = options.auditStore;

    this.transport = options.transport || new LocalDirectTransport(this.keyPair.identity.agent_id);

    this.invocationHandler = new CapabilityInvocationHandler({
      keyPair: this.keyPair,
      policy: this.policy,
      policyEngine: this.policyEngine,
      registry: this.capabilityRegistry,
      peerManager: this.peerManager,
      reputationManager: this.reputationManager,
      resourceGuard: this.resourceGuard,
      transport: this.transport,
      auditStore: this.auditStore,
    });

    this.distributedRAG = new DistributedRAGClient({
      invocationHandler: this.invocationHandler,
      peerManager: this.peerManager,
    });

    // Wire transport incoming message dispatcher
    this.transport.onMessage(async (msg) => {
      if (msg.message_type === "CAPABILITY_REQUEST") {
        const response = await this.invocationHandler.handleIncomingRequest(msg.payload as any);
        const respMsg = {
          message_id: `msg_resp_${Date.now()}`,
          sender_agent_id: this.keyPair.identity.agent_id,
          recipient_agent_id: msg.sender_agent_id,
          message_type: "CAPABILITY_RESPONSE" as const,
          timestamp: new Date().toISOString(),
          nonce: Math.random().toString(36).slice(2),
          payload: response,
          signature: response.signature || "",
          protocol_version: "1.0.0",
        };
        await this.transport.send(respMsg);
      }
    });
  }

  async start(): Promise<void> {
    if (this.isStarted) return;

    // Load persisted state if exists
    const persisted = await this.storage.load();
    if (persisted) {
      for (const p of persisted.peers) {
        this.peerManager.registerPeer(p);
      }
      for (const c of persisted.capabilities) {
        this.capabilityRegistry.register(c);
      }
      for (const b of persisted.blocklist) {
        this.peerManager.blockPeer(b.agent_id, b.reason);
      }
    }

    // Register standard safe capabilities
    this.capabilityRegistry.registerDefaults(this.keyPair.identity.agent_id);
    this.isStarted = true;
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return;
    await this.saveState();
    this.isStarted = false;
  }

  async saveState(): Promise<void> {
    await this.storage.save(this.keyPair.identity.agent_id, {
      peers: this.peerManager.listPeers(),
      capabilities: this.capabilityRegistry.list(),
      reputation: this.reputationManager.listRecords(),
      blocklist: this.peerManager.getBlocklist(),
    });
  }

  getIdentity(): AgentIdentity {
    return { ...this.keyPair.identity };
  }

  getPeerManager(): PeerManager {
    return this.peerManager;
  }

  getCapabilityRegistry(): CapabilityRegistry {
    return this.capabilityRegistry;
  }

  getReputationManager(): ReputationManager {
    return this.reputationManager;
  }

  getInvocationHandler(): CapabilityInvocationHandler {
    return this.invocationHandler;
  }

  getDistributedRAG(): DistributedRAGClient {
    return this.distributedRAG;
  }

  getTransport(): ITransport {
    return this.transport;
  }

  registerCapability(cap: Capability, executor?: CapabilityExecutorFn): void {
    this.capabilityRegistry.register(cap);
    if (executor) {
      this.invocationHandler.registerExecutor(cap.capability_id, executor);
    }
  }

  async invokeRemoteCapability(params: {
    targetAgentId: string;
    capabilityId: string;
    capabilityVersion?: string;
    input: Record<string, unknown>;
    dataClassification?: DataClassification;
    timeoutMs?: number;
  }): Promise<CapabilityResponse> {
    return this.invocationHandler.invokeRemoteCapability(params);
  }

  getStatus(): NetworkNodeStatus {
    const health = this.transport.health();
    return {
      agent_id: this.keyPair.identity.agent_id,
      public_key: this.keyPair.identity.public_key,
      algorithm: this.keyPair.identity.key_algorithm,
      transport_status: `${health.transportType} (${health.status})`,
      peers_count: this.peerManager.listPeers().length,
      capabilities_count: this.capabilityRegistry.list().length,
      blocked_peers_count: this.peerManager.getBlocklist().length,
      reputation_records_count: this.reputationManager.listRecords().length,
    };
  }
}
