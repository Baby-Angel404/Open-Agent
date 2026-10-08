# Cryptographic Agent Identity

OpenAgent Infrastructure uses asymmetric cryptography to provide globally unique, deterministic, and verifiable agent identities without relying on centralized certificate authorities or identity registries.

## Key Generation & Fingerprinting

Every agent node creates an **Ed25519** asymmetric keypair:

1. **Key Generation**: Uses standard `ed25519` key generation producing DER-encoded SPKI public keys and PKCS#8 private keys encoded in base64.
2. **Deterministic Agent ID**:
   ```
   Agent ID = "agent_" + SHA-256(DER(PublicKey))[0..24]
   ```
   Example: `agent_8771bc72522863f02e2e7b6f`.
3. **Verification Invariant**: Any node receiving an agent ID verifies that `agent_id === deriveAgentId(public_key)`. If the hash does not match the public key, the message is rejected with `INVALID_SIGNATURE`.

## Local Storage & Key Isolation

- **File Location**: `.network-store/agent-identity.json` (or configured directory).
- **Filesystem Permissions**: Written with POSIX file mode `0o600` (read/write restricted exclusively to the process owner).
- **Boundary Invariant**: Private keys are strictly local and are NEVER serialized in network packets, audit exports, or API responses.

## Identity Data Structures

```typescript
export interface AgentIdentity {
  agent_id: string;
  public_key: string; // Base64 encoded DER SPKI
  key_algorithm: "Ed25519";
  created_at: string; // ISO 8601 timestamp
  metadata?: Record<string, unknown>;
}

export interface AgentKeyPair {
  identity: AgentIdentity;
  private_key: string; // Base64 encoded DER PKCS#8 (NEVER SHARED)
}
```

## Source Reference

- Implementation: [`packages/network/src/identity/identity-manager.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/identity/identity-manager.ts)
- Rust Implementation: [`crates/network-core/src/identity.rs`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/crates/network-core/src/identity.rs)
