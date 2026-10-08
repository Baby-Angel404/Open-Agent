import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { AgentIdentity, AgentKeyPair } from "../types/index.js";

export class IdentityManager {
  /**
   * Generates a new cryptographic Ed25519 identity.
   * Deterministically derives agent_id from the public key SHA-256 fingerprint.
   */
  static generateKeyPair(
    options: {
      isDevelopment?: boolean;
      metadata?: Record<string, unknown>;
    } = {}
  ): AgentKeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "der" },
      privateKeyEncoding: { type: "pkcs8", format: "der" },
    });

    const pubKeyBase64 = publicKey.toString("base64");
    const privKeyBase64 = privateKey.toString("base64");

    const fingerprint = crypto.createHash("sha256").update(publicKey).digest("hex").slice(0, 24);
    const agentId = `agent_${fingerprint}`;

    const identity: AgentIdentity = {
      agent_id: agentId,
      public_key: pubKeyBase64,
      key_algorithm: "Ed25519",
      created_at: new Date().toISOString(),
      metadata: {
        environment: options.isDevelopment ? "development" : "production",
        ...(options.metadata || {}),
      },
    };

    return {
      identity,
      private_key: privKeyBase64,
    };
  }

  /**
   * Cryptographically signs arbitrary data using the agent's Ed25519 private key.
   */
  static sign(data: string | Buffer, privateKeyBase64: string): string {
    const privKeyDer = Buffer.from(privateKeyBase64, "base64");
    const keyObject = crypto.createPrivateKey({
      key: privKeyDer,
      format: "der",
      type: "pkcs8",
    });

    const bufferToSign = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    const signature = crypto.sign(null, bufferToSign, keyObject);
    return signature.toString("base64");
  }

  /**
   * Verifies an Ed25519 signature against the agent's public key.
   */
  static verify(data: string | Buffer, signatureBase64: string, publicKeyBase64: string): boolean {
    try {
      const pubKeyDer = Buffer.from(publicKeyBase64, "base64");
      const keyObject = crypto.createPublicKey({
        key: pubKeyDer,
        format: "der",
        type: "spki",
      });

      const bufferToVerify = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
      const signature = Buffer.from(signatureBase64, "base64");
      return crypto.verify(null, bufferToVerify, keyObject, signature);
    } catch {
      return false;
    }
  }

  /**
   * Deterministically derives an agent_id from an Ed25519 public key.
   */
  static deriveAgentId(publicKeyBase64: string): string {
    const pubKeyDer = Buffer.from(publicKeyBase64, "base64");
    const fingerprint = crypto.createHash("sha256").update(pubKeyDer).digest("hex").slice(0, 24);
    return `agent_${fingerprint}`;
  }

  /**
   * Verifies that an agent_id matches the public key fingerprint.
   */
  static verifyAgentIdMatchesPublicKey(agentId: string, publicKeyBase64: string): boolean {
    try {
      return agentId === this.deriveAgentId(publicKeyBase64);
    } catch {
      return false;
    }
  }

  /**
   * Securely loads or persists an AgentKeyPair to local disk with 0600 permissions.
   * Private keys NEVER leave local disk.
   */
  static loadOrCreateIdentity(storageDir: string, isDevelopment = false): AgentKeyPair {
    const dir = path.resolve(process.cwd(), storageDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const keyFilePath = path.join(dir, "agent-identity.json");
    if (fs.existsSync(keyFilePath)) {
      try {
        const raw = fs.readFileSync(keyFilePath, "utf-8");
        const keyPair: AgentKeyPair = JSON.parse(raw);
        if (
          keyPair.identity?.agent_id &&
          keyPair.identity?.public_key &&
          keyPair.private_key &&
          this.verifyAgentIdMatchesPublicKey(keyPair.identity.agent_id, keyPair.identity.public_key)
        ) {
          return keyPair;
        }
      } catch {
        // Fallback: regenerate if corrupted
      }
    }

    const newKeyPair = this.generateKeyPair({ isDevelopment });
    fs.writeFileSync(keyFilePath, JSON.stringify(newKeyPair, null, 2), {
      encoding: "utf-8",
      mode: 0o600, // Read/write only by owner
    });
    return newKeyPair;
  }
}
