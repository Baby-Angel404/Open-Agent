# Decentralized Agent Network Architecture

OpenAgent Infrastructure Phase 6 introduces a secure, decentralized networking layer enabling independent local agents to discover peers, advertise capabilities, and invoke remote services without bypassing local security boundaries.

## Architectural Principles

1. **Local Policy Is Authoritative**: Remote agents are untrusted entities. Every incoming and outgoing operation must be evaluated and approved by the local deterministic Policy Engine.
2. **Cryptographic Identity**: Every agent possesses an asymmetric Ed25519 keypair. Identity is verified cryptographically via canonical preimages.
3. **Discovery != Trust**: Discovered peers begin in `UNKNOWN` state. Trust is earned incrementally through verifiable cryptographic evidence.
4. **No Blockchain / No Tokens**: Designed purely for capability federation and distributed retrieval without cryptocurrencies or speculative mechanics.
5. **Private Keys Never Leave Disk**: Private keys are stored locally with strict `0600` filesystem permissions and are never transmitted across the network.

## System Diagram

```
                 Remote Agent (Untrusted Content)
                              │
                    [Transport Abstraction]
                   (Direct Bus / HTTP JSON)
                              │
                              ▼
                   [Protocol Authenticator]
           (Ed25519 Verify, Nonce Cache, Clock Skew)
                              │
                              ▼
                     [Peer Manager & Guard]
               (Blocklist Check, Rate Limits)
                              │
                              ▼
               [Local Policy Engine (Gatekeeper)]
            (CAPABILITY_INVOCATION, DATA_TRANSFER)
                    ┌─────────┴─────────┐
                 [ALLOW]             [DENY]
                    │                   │
                    ▼                   ▼
          [Capability Handler]  [Drop & Penalize]
          (Execute Local Code)  (Reputation -25)
                    │                   │
                    └─────────┬─────────┘
                              ▼
                 [Append-Only Audit Log]
             (Hash-Chained Cryptographic Trail)
```

## Core Components

- **[`IdentityManager`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/identity/identity-manager.ts)**: Ed25519 keypair generation and deterministic SHA-256 fingerprint agent ID derivation (`agent_<hash>`).
- **[`ProtocolAuthenticator`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/protocol/authenticator.ts)**: Canonical JSON preimage formatting, signature verification, and sliding window replay protection.
- **[`CapabilityRegistry`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/capabilities/capability-registry.ts)**: Schema validation, risk tiering, SemVer compatibility, and absolute prohibition of arbitrary remote code execution.
- **[`PeerManager`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/discovery/peer-manager.ts)**: Peer tracking, trust state transitions, and local administrative blocklist.
- **[`ResourceGuard`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/guards/resource-guard.ts)**: Payload size limits, concurrency caps, and sliding-window rate limiters.
- **[`ReputationManager`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/reputation/reputation-manager.ts)**: Deterministic mathematical scoring clamped to [0, 100].
- **[`DistributedRAGClient`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/rag/distributed-rag.ts)**: Distributed search combining local and remote evidence with provenance tagging and prompt injection sanitization.
- **[`NetworkStorage`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/storage/network-storage.ts)**: Atomic persistence for peers, capabilities, blocklist, and reputation records.
