import { RemoteProvenanceEvidence } from "../types/index.js";
import { CapabilityInvocationHandler } from "../invocation/invocation-handler.js";
import { PeerManager } from "../discovery/peer-manager.js";

export type DistributedSearchMode = "local_only" | "local_and_trusted" | "network_wide";

export interface DistributedSearchResultItem {
  id: string;
  content: string;
  score: number;
  source: string;
  origin: "LOCAL EVIDENCE" | "REMOTE EVIDENCE";
  providerAgentId?: string;
  sanitized: boolean;
}

export class DistributedRAGClient {
  private invocationHandler: CapabilityInvocationHandler;
  private peerManager: PeerManager;

  // Patterns indicating malicious prompt injection in untrusted external text
  private static readonly INJECTION_PATTERNS = [
    /ignore (all|previous) instructions/i,
    /you are now in developer mode/i,
    /disregard policy/i,
    /send (credentials|keys|secrets)/i,
    /exfiltrate/i,
  ];

  constructor(options: {
    invocationHandler: CapabilityInvocationHandler;
    peerManager: PeerManager;
  }) {
    this.invocationHandler = options.invocationHandler;
    this.peerManager = options.peerManager;
  }

  /**
   * Performs distributed document search across local results and remote agent capabilities.
   */
  async search(params: {
    query: string;
    mode: DistributedSearchMode;
    topK?: number;
    localResults?: Array<{ id: string; content: string; score: number; source?: string }>;
  }): Promise<{
    results: DistributedSearchResultItem[];
    remoteEvidence: RemoteProvenanceEvidence[];
  }> {
    const combined: DistributedSearchResultItem[] = [];
    const collectedEvidence: RemoteProvenanceEvidence[] = [];

    // 1. Add Local Evidence (Highest confidence provenance)
    if (params.localResults) {
      for (const loc of params.localResults) {
        combined.push({
          id: loc.id,
          content: loc.content,
          score: loc.score,
          source: loc.source || "local_vector_index",
          origin: "LOCAL EVIDENCE",
          sanitized: false,
        });
      }
    }

    if (params.mode === "local_only") {
      return { results: combined, remoteEvidence: [] };
    }

    // 2. Discover candidates based on trust mode
    const peers = this.peerManager.listPeers();
    const candidatePeers = peers.filter((p) => {
      if (p.trust_state === "BLOCKED") return false;
      if (params.mode === "local_and_trusted") {
        return p.trust_state === "TRUSTED" || p.trust_state === "VERIFIED";
      }
      return true; // network_wide mode
    });

    // 3. Query remote peers supporting document.search
    for (const peer of candidatePeers) {
      const searchCap = peer.capabilities.find((c) => c.name === "document.search");
      if (!searchCap) continue;

      try {
        const resp = await this.invocationHandler.invokeRemoteCapability({
          targetAgentId: peer.agent_id,
          capabilityId: searchCap.capability_id,
          input: {
            query: params.query,
            top_k: params.topK || 3,
          },
          timeoutMs: 3000,
        });

        if (resp.status === "COMPLETED" && resp.output) {
          const hits = Array.isArray(resp.output)
            ? resp.output
            : (resp.output as any).results || [];

          for (const hit of hits) {
            const rawContent = String(hit.content || hit.text || "");
            const { sanitizedContent, wasSanitized } = this.sanitizeRemoteContent(rawContent);

            combined.push({
              id: hit.id || `remote_${peer.agent_id}_${Math.random().toString(36).slice(2, 8)}`,
              content: sanitizedContent,
              score: (Number(hit.score) || 0.5) * 0.9, // Slightly discount remote results relative to local ground truth
              source: `remote_peer_${peer.agent_id}`,
              origin: "REMOTE EVIDENCE",
              providerAgentId: peer.agent_id,
              sanitized: wasSanitized,
            });

            collectedEvidence.push({
              source_agent_id: peer.agent_id,
              capability_id: searchCap.capability_id,
              request_id: resp.request_id,
              chunk_id: hit.id,
              snippet: sanitizedContent.slice(0, 150),
              confidence: Number(hit.score) || 0.5,
              verified_local: false,
            });
          }
        }
      } catch {
        // Individual remote peer failures do not crash distributed retrieval
      }
    }

    // Sort by score descending
    combined.sort((a, b) => b.score - a.score);
    const topLimit = params.topK || 5;

    return {
      results: combined.slice(0, topLimit),
      remoteEvidence: collectedEvidence,
    };
  }

  /**
   * Neutralizes prompt injection strings inside remote untrusted text.
   */
  sanitizeRemoteContent(text: string): { sanitizedContent: string; wasSanitized: boolean } {
    let sanitized = text;
    let wasSanitized = false;

    for (const pattern of DistributedRAGClient.INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        sanitized = sanitized.replace(pattern, "[UNTRUSTED INSTRUCTION FILTERED]");
        wasSanitized = true;
      }
    }

    return { sanitizedContent: sanitized, wasSanitized };
  }
}
