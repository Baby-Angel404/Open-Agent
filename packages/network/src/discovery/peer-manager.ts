import { Peer, TrustState, ConnectionStatus, Capability } from "../types/index.js";
import { IdentityManager } from "../identity/identity-manager.js";

export class PeerManager {
  private peers: Map<string, Peer> = new Map();
  private blockedAgents: Map<string, { reason: string; timestamp: string }> = new Map();

  /**
   * Registers or updates a discovered peer.
   * Invariant: Discovery != Trust. Discovered peers start as UNKNOWN or OBSERVED.
   */
  registerPeer(peerData: {
    agent_id: string;
    public_key: string;
    addresses?: string[];
    capabilities?: Capability[];
    metadata?: Record<string, unknown>;
  }): Peer {
    if (!IdentityManager.verifyAgentIdMatchesPublicKey(peerData.agent_id, peerData.public_key)) {
      throw new Error(
        `Security validation failed: Agent ID '${peerData.agent_id}' does not match public key fingerprint`
      );
    }

    const isBlocked = this.blockedAgents.has(peerData.agent_id);
    const existing = this.peers.get(peerData.agent_id);
    const now = new Date().toISOString();

    if (existing) {
      existing.last_seen = now;
      if (peerData.addresses) {
        existing.addresses = Array.from(new Set([...existing.addresses, ...peerData.addresses]));
      }
      if (peerData.capabilities) {
        existing.capabilities = peerData.capabilities;
      }
      return { ...existing };
    }

    const newPeer: Peer = {
      peer_id: `peer_${peerData.agent_id.replace(/^agent_/, "")}`,
      agent_id: peerData.agent_id,
      public_key: peerData.public_key,
      addresses: peerData.addresses || [],
      capabilities: peerData.capabilities || [],
      first_seen: now,
      last_seen: now,
      connection_status: "DISCONNECTED",
      trust_state: isBlocked ? "BLOCKED" : "UNKNOWN",
      reputation_score: 50.0, // Default neutral score
    };

    this.peers.set(peerData.agent_id, newPeer);
    return { ...newPeer };
  }

  getPeer(agentId: string): Peer | undefined {
    const p = this.peers.get(agentId);
    return p ? { ...p } : undefined;
  }

  listPeers(): Peer[] {
    return Array.from(this.peers.values()).map((p) => ({ ...p }));
  }

  updateTrustState(agentId: string, state: TrustState): boolean {
    const peer = this.peers.get(agentId);
    if (!peer) return false;

    if (this.blockedAgents.has(agentId) && state !== "BLOCKED") {
      throw new Error(
        `Cannot set trust state on blocked peer '${agentId}' without unblocking first`
      );
    }

    peer.trust_state = state;
    peer.last_seen = new Date().toISOString();
    return true;
  }

  updateConnectionStatus(agentId: string, status: ConnectionStatus): boolean {
    const peer = this.peers.get(agentId);
    if (!peer) return false;
    peer.connection_status = status;
    peer.last_seen = new Date().toISOString();
    return true;
  }

  updateCapabilities(agentId: string, capabilities: Capability[]): boolean {
    const peer = this.peers.get(agentId);
    if (!peer) return false;
    peer.capabilities = capabilities;
    peer.last_seen = new Date().toISOString();
    return true;
  }

  setReputationScore(agentId: string, score: number): void {
    const peer = this.peers.get(agentId);
    if (peer) {
      peer.reputation_score = Math.max(0, Math.min(100, score));
    }
  }

  /**
   * Blocks a peer by agent ID.
   * Blocked peers are prevented from connecting, sending requests, or invoking capabilities.
   */
  blockPeer(agentId: string, reason = "Manual administrative block"): void {
    this.blockedAgents.set(agentId, { reason, timestamp: new Date().toISOString() });
    const peer = this.peers.get(agentId);
    if (peer) {
      peer.trust_state = "BLOCKED";
      peer.connection_status = "DISCONNECTED";
    }
  }

  unblockPeer(agentId: string): boolean {
    const removed = this.blockedAgents.delete(agentId);
    const peer = this.peers.get(agentId);
    if (peer && peer.trust_state === "BLOCKED") {
      peer.trust_state = "UNKNOWN"; // Reset to UNKNOWN, never immediately TRUSTED
    }
    return removed;
  }

  isBlocked(agentId: string): boolean {
    return this.blockedAgents.has(agentId);
  }

  getBlocklist(): Array<{ agent_id: string; reason: string; timestamp: string }> {
    return Array.from(this.blockedAgents.entries()).map(([agent_id, entry]) => ({
      agent_id,
      ...entry,
    }));
  }
}
