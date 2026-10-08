import * as crypto from "node:crypto";
import { NetworkMessage, MessageType, AgentKeyPair, NetworkLimits } from "../types/index.js";
import { IdentityManager } from "../identity/identity-manager.js";

export const DEFAULT_NETWORK_LIMITS: NetworkLimits = {
  max_request_size_bytes: 1024 * 1024, // 1MB
  max_response_size_bytes: 2 * 1024 * 1024, // 2MB
  max_execution_time_ms: 5000,
  max_concurrent_requests: 20,
  max_requests_per_peer_per_minute: 60,
  max_requests_per_capability_per_minute: 30,
  clock_skew_tolerance_ms: 5 * 60 * 1000, // 5 minutes
  max_cached_nonces: 50_000,
};

export class MessageAuthenticator {
  private limits: Required<NetworkLimits>;
  // Nonce -> Expiration timestamp
  private seenNonces: Map<string, number> = new Map();

  constructor(limits: Partial<NetworkLimits> = {}) {
    this.limits = {
      ...DEFAULT_NETWORK_LIMITS,
      max_cached_nonces: 50_000,
      ...limits,
    };
  }

  /**
   * Deterministically serializes an object with sorted keys for reproducible signing.
   */
  static canonicalize(obj: unknown): string {
    if (obj === null || typeof obj !== "object") {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return "[" + obj.map((item) => MessageAuthenticator.canonicalize(item)).join(",") + "]";
    }
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys
      .filter((k) => (obj as Record<string, unknown>)[k] !== undefined)
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          MessageAuthenticator.canonicalize((obj as Record<string, unknown>)[k])
      );
    return "{" + pairs.join(",") + "}";
  }

  /**
   * Computes the signing preimage for a message.
   */
  static computeSigningPayload(message: Omit<NetworkMessage, "signature">): string {
    const preimage = {
      message_id: message.message_id,
      sender_agent_id: message.sender_agent_id,
      recipient_agent_id: message.recipient_agent_id,
      message_type: message.message_type,
      timestamp: message.timestamp,
      nonce: message.nonce,
      payload: message.payload,
      protocol_version: message.protocol_version,
    };
    return MessageAuthenticator.canonicalize(preimage);
  }

  /**
   * Creates and cryptographically signs a NetworkMessage.
   */
  createMessage<T>(params: {
    senderKeyPair: AgentKeyPair;
    recipientAgentId: string;
    messageType: MessageType;
    payload: T;
  }): NetworkMessage<T> {
    const messageId = `msg_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomBytes(16).toString("hex");

    const unsignedMessage: Omit<NetworkMessage<T>, "signature"> = {
      message_id: messageId,
      sender_agent_id: params.senderKeyPair.identity.agent_id,
      recipient_agent_id: params.recipientAgentId,
      message_type: params.messageType,
      timestamp,
      nonce,
      payload: params.payload,
      protocol_version: "1.0.0",
    };

    const payloadToSign = MessageAuthenticator.computeSigningPayload(unsignedMessage);
    const signature = IdentityManager.sign(payloadToSign, params.senderKeyPair.private_key);

    return {
      ...unsignedMessage,
      signature,
    };
  }

  /**
   * Verifies an incoming NetworkMessage for authenticity, expiration, and replay attacks.
   */
  verifyMessage(
    message: NetworkMessage,
    senderPublicKey: string
  ): { valid: boolean; error?: string } {
    this.purgeExpiredNonces();

    // 1. Protocol Version
    if (message.protocol_version !== "1.0.0") {
      return {
        valid: false,
        error: `Incompatible protocol version '${message.protocol_version}'. Expected '1.0.0'`,
      };
    }

    // 2. Sender ID must match the public key fingerprint
    if (!IdentityManager.verifyAgentIdMatchesPublicKey(message.sender_agent_id, senderPublicKey)) {
      return {
        valid: false,
        error: `Sender agent ID '${message.sender_agent_id}' does not match public key fingerprint`,
      };
    }

    // 3. Size check
    const serialized = JSON.stringify(message);
    if (serialized.length > this.limits.max_request_size_bytes) {
      return {
        valid: false,
        error: `Message payload exceeds maximum limit of ${this.limits.max_request_size_bytes} bytes`,
      };
    }

    // 4. Timestamp & Expiration check
    const msgTime = new Date(message.timestamp).getTime();
    if (isNaN(msgTime)) {
      return { valid: false, error: "Invalid timestamp in message" };
    }
    const now = Date.now();
    if (Math.abs(now - msgTime) > this.limits.clock_skew_tolerance_ms) {
      return {
        valid: false,
        error: `Message expired or clock skew exceeded tolerance (${Math.abs(now - msgTime)}ms > ${this.limits.clock_skew_tolerance_ms}ms)`,
      };
    }

    // 5. Replay Attack Prevention (Nonce validation)
    if (!message.nonce || message.nonce.length < 8) {
      return { valid: false, error: "Missing or malformed message nonce" };
    }
    const nonceKey = `${message.sender_agent_id}:${message.nonce}`;
    if (this.seenNonces.has(nonceKey)) {
      return {
        valid: false,
        error: `Replay attack detected: Nonce '${message.nonce}' has already been processed`,
      };
    }

    // 6. Cryptographic Signature Verification
    const payloadToVerify = MessageAuthenticator.computeSigningPayload(message);
    const signatureValid = IdentityManager.verify(
      payloadToVerify,
      message.signature,
      senderPublicKey
    );
    if (!signatureValid) {
      return { valid: false, error: "Cryptographic signature verification failed" };
    }

    // Register nonce with expiration, enforcing bounded cache size (OA-SEC-005)
    if (this.seenNonces.size >= this.limits.max_cached_nonces) {
      this.purgeExpiredNonces();
      while (this.seenNonces.size >= this.limits.max_cached_nonces) {
        const oldestKey = this.seenNonces.keys().next().value;
        if (!oldestKey) break;
        this.seenNonces.delete(oldestKey);
      }
    }

    this.seenNonces.set(nonceKey, now + this.limits.clock_skew_tolerance_ms);
    return { valid: true };
  }

  private purgeExpiredNonces(): void {
    const now = Date.now();
    for (const [nonceKey, expiry] of this.seenNonces.entries()) {
      if (now > expiry) {
        this.seenNonces.delete(nonceKey);
      }
    }
  }

  resetReplayCache(): void {
    this.seenNonces.clear();
  }
}
