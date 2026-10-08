import * as http from "node:http";
import { Peer, NetworkMessage } from "../types/index.js";

export interface TransportHealth {
  status: "HEALTHY" | "DEGRADED" | "DOWN";
  transportType: string;
  activeConnections: number;
}

export interface ITransport {
  connect(peer: Peer): Promise<boolean>;
  disconnect(agentId: string): Promise<void>;
  send(message: NetworkMessage): Promise<void>;
  onMessage(handler: (message: NetworkMessage) => Promise<void> | void): void;
  health(): TransportHealth;
}

/**
 * Direct in-memory virtual transport bus for deterministic testing and local multi-agent simulations.
 */
export class LocalDirectTransport implements ITransport {
  private static buses: Map<string, LocalDirectTransport> = new Map();
  private localAgentId: string;
  private messageHandlers: Array<(msg: NetworkMessage) => Promise<void> | void> = [];
  private connectedAgents: Set<string> = new Set();

  constructor(localAgentId: string) {
    this.localAgentId = localAgentId;
    LocalDirectTransport.buses.set(localAgentId, this);
  }

  static getBus(agentId: string): LocalDirectTransport | undefined {
    return LocalDirectTransport.buses.get(agentId);
  }

  static clearBuses(): void {
    LocalDirectTransport.buses.clear();
  }

  async connect(peer: Peer): Promise<boolean> {
    const remoteBus = LocalDirectTransport.buses.get(peer.agent_id);
    if (!remoteBus) {
      return false;
    }
    this.connectedAgents.add(peer.agent_id);
    remoteBus.connectedAgents.add(this.localAgentId);
    return true;
  }

  async disconnect(agentId: string): Promise<void> {
    this.connectedAgents.delete(agentId);
    const remoteBus = LocalDirectTransport.buses.get(agentId);
    if (remoteBus) {
      remoteBus.connectedAgents.delete(this.localAgentId);
    }
  }

  async send(message: NetworkMessage): Promise<void> {
    const targetBus = LocalDirectTransport.buses.get(message.recipient_agent_id);
    if (!targetBus) {
      throw new Error(
        `Target agent '${message.recipient_agent_id}' is unreachable on transport bus`
      );
    }

    // Deliver copy to prevent shared reference mutation
    const delivered: NetworkMessage = JSON.parse(JSON.stringify(message));
    for (const handler of targetBus.messageHandlers) {
      await handler(delivered);
    }
  }

  onMessage(handler: (message: NetworkMessage) => Promise<void> | void): void {
    this.messageHandlers.push(handler);
  }

  health(): TransportHealth {
    return {
      status: "HEALTHY",
      transportType: "LocalDirectTransport",
      activeConnections: this.connectedAgents.size,
    };
  }
}

/**
 * HTTP JSON Transport for cross-platform inter-process agent communication.
 */
export class HttpJsonTransport implements ITransport {
  private localAgentId: string;
  private messageHandlers: Array<(msg: NetworkMessage) => Promise<void> | void> = [];
  private peerAddresses: Map<string, string> = new Map();

  constructor(localAgentId: string) {
    this.localAgentId = localAgentId;
  }

  async connect(peer: Peer): Promise<boolean> {
    if (!peer.addresses || peer.addresses.length === 0) {
      return false;
    }
    this.peerAddresses.set(peer.agent_id, peer.addresses[0]);
    return true;
  }

  async disconnect(agentId: string): Promise<void> {
    this.peerAddresses.delete(agentId);
  }

  async send(message: NetworkMessage): Promise<void> {
    const targetUrl = this.peerAddresses.get(message.recipient_agent_id);
    if (!targetUrl) {
      throw new Error(`No registered address for peer '${message.recipient_agent_id}'`);
    }

    const parsed = new URL(targetUrl);
    const postData = JSON.stringify(message);

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || 80,
          path: parsed.pathname || "/api/v1/network/message",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          },
          timeout: 4000,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Peer HTTP transport returned status ${res.statusCode}`));
          }
        }
      );

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Transport timeout sending to ${targetUrl}`));
      });

      req.write(postData);
      req.end();
    });
  }

  onMessage(handler: (message: NetworkMessage) => Promise<void> | void): void {
    this.messageHandlers.push(handler);
  }

  async receiveIncoming(message: NetworkMessage): Promise<void> {
    for (const h of this.messageHandlers) {
      await h(message);
    }
  }

  health(): TransportHealth {
    return {
      status: "HEALTHY",
      transportType: "HttpJsonTransport",
      activeConnections: this.peerAddresses.size,
    };
  }
}
