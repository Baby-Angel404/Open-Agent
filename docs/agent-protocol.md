# Agent Wire Protocol & Message Authentication

The OpenAgent wire protocol specifies how autonomous agents exchange structured messages, verify authenticity, prevent replay attacks, and handle capability requests.

## Message Format

All network messages adhere to a standardized wire schema:

```typescript
export interface NetworkMessage<T = unknown> {
  message_id: string; // UUID or monotonic identifier
  sender_agent_id: string; // Must match sender's public key fingerprint
  recipient_agent_id: string; // Target node or broadcast
  message_type: MessageType; // HELLO, HELLO_ACK, CAPABILITY_REQUEST, etc.
  timestamp: string; // ISO 8601 UTC timestamp
  nonce: string; // Cryptographically random nonce
  payload: T; // Typed payload body
  signature: string; // Ed25519 signature over canonical preimage
  protocol_version: "1.0.0";
}
```

## Canonical JSON Signing Preimage

To avoid signature discrepancies caused by JSON key order variations, preimages are constructed using sorted recursive keys:

```
Preimage = canonicalJson({
  message_id,
  sender_agent_id,
  recipient_agent_id,
  message_type,
  timestamp,
  nonce,
  payload,
  protocol_version
})
```

The signature is generated as: `Ed25519_Sign(privateKey, UTF8(Preimage))`.

## Replay Attack Protection

1. **Clock Skew Check**: Messages with timestamps differing by more than ±30 seconds (`clock_skew_tolerance_ms`) from local UTC time are discarded.
2. **Nonce Cache**: Nonces are stored in a sliding window cache for 10 minutes (`nonce_cache_ttl_ms`). Re-used nonces within the valid time window are rejected with `REPLAY_ATTEMPT` (-30 reputation penalty).

## Message Handshake Flow

```
Agent A                                              Agent B
   │                                                    │
   ├─────────── HELLO (Identity, Caps) ────────────────►│ (Verify Sig & Fingerprint)
   │                                                    │ (Check Blocklist & Limits)
   │◄────────── HELLO_ACK (Identity, Session) ──────────┤
   │                                                    │
   ├─────────── CAPABILITY_REQUEST ────────────────────►│ (Local Policy Engine Check)
   │                                                    │ (Execute Capability)
   │◄────────── CAPABILITY_RESPONSE ────────────────────┤ (Signed Output + Provenance)
```

## Source Reference

- Implementation: [`packages/network/src/protocol/authenticator.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/protocol/authenticator.ts)
- Message Definitions: [`packages/network/src/types/index.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/types/index.ts)
