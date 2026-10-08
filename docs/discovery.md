# Decentralized Peer Discovery & Lifecycle

OpenAgent treats peer discovery as completely decoupled from trust. Knowing that an agent exists does not confer permission to invoke actions or receive sensitive information.

## Invariant: Discovery != Trust

All newly registered or discovered peers enter the system in the `UNKNOWN` trust state:

```
            ┌───────────────────┐
            │      UNKNOWN      │ ◄── Initial state on discovery
            └─────────┬─────────┘
                      │ Successful handshakes & verifications
                      ▼
            ┌───────────────────┐
            │     OBSERVED      │
            └─────────┬─────────┘
                      │ Multiple validated operations + high reputation
                      ▼
            ┌───────────────────┐
            │     VERIFIED      │
            └─────────┬─────────┘
                      │ Explicit admin approval or long-term high trust
                      ▼
            ┌───────────────────┐
            │      TRUSTED      │
            └───────────────────┘

   ┌────────────────────────────────────────────────┐
   │ Any state ─── Security Violation ───► BLOCKED  │
   └────────────────────────────────────────────────┘
```

## Trust States

- **`UNKNOWN`**: Peer has been discovered via broadcast or manual address entry, but has zero verification history.
- **`OBSERVED`**: Peer has performed at least one valid cryptographic handshake without anomalies.
- **`VERIFIED`**: Peer has sustained consecutive successful requests with reputation score > 75.
- **`TRUSTED`**: Peer is explicitly whitelisted for sensitive data transfers or specialized workflows.
- **`BLOCKED`**: Peer is blacklisted. All messages, requests, and invocations are immediately dropped.

## Blocklist Mechanics

- When an agent is blocked, an entry is added to `PeerManager.blockedAgents` with an administrative reason and timestamp.
- Unblocking resets the peer state to `UNKNOWN`, never directly back to `TRUSTED`.

## Source Reference

- Peer Management: [`packages/network/src/discovery/peer-manager.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/discovery/peer-manager.ts)
- Types: [`packages/network/src/types/index.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/types/index.ts)
