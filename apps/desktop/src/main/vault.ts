import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

interface VaultEntry {
  iv: string; // hex
  tag: string; // hex
  data: string; // hex
}

interface VaultData {
  version: number;
  salt: string; // hex
  entries: Record<string, VaultEntry>;
}

export class CredentialVault {
  private readonly vaultFile: string;
  private readonly masterKey: Buffer;
  private cache: Record<string, string> = {};
  private initialized = false;

  constructor(vaultDir: string, passphrase?: string) {
    this.vaultFile = path.join(vaultDir, "vault.enc");
    // Derive key using node machine identifier or provided passphrase
    const effectivePassphrase =
      passphrase || process.env.OPENAGENT_VAULT_KEY || "openagent-local-desktop-vault-default";
    const salt = Buffer.from("openagent-salt-static-v1");
    this.masterKey = pbkdf2Sync(effectivePassphrase, salt, 100_000, 32, "sha256");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const content = await fs.readFile(this.vaultFile, "utf-8");
      const vaultData: VaultData = JSON.parse(content);

      this.cache = {};
      for (const [key, entry] of Object.entries(vaultData.entries)) {
        try {
          const iv = Buffer.from(entry.iv, "hex");
          const tag = Buffer.from(entry.tag, "hex");
          const decipher = createDecipheriv("aes-256-gcm", this.masterKey, iv);
          decipher.setAuthTag(tag);
          let decrypted = decipher.update(entry.data, "hex", "utf-8");
          decrypted += decipher.final("utf-8");
          this.cache[key] = decrypted;
        } catch {
          // Skip corrupted or un-decryptable keys
        }
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
      this.cache = {};
    }

    this.initialized = true;
  }

  async setSecret(key: string, value: string): Promise<void> {
    await this.initialize();
    this.cache[key] = value;
    await this.persist();
  }

  async getSecret(key: string): Promise<string | undefined> {
    await this.initialize();
    return this.cache[key];
  }

  async hasSecret(key: string): Promise<boolean> {
    await this.initialize();
    return key in this.cache;
  }

  async deleteSecret(key: string): Promise<boolean> {
    await this.initialize();
    if (key in this.cache) {
      delete this.cache[key];
      await this.persist();
      return true;
    }
    return false;
  }

  async listKeys(): Promise<string[]> {
    await this.initialize();
    return Object.keys(this.cache);
  }

  private async persist(): Promise<void> {
    const entries: Record<string, VaultEntry> = {};

    for (const [key, value] of Object.entries(this.cache)) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", this.masterKey, iv);
      let encrypted = cipher.update(value, "utf-8", "hex");
      encrypted += cipher.final("hex");
      const tag = cipher.getAuthTag();

      entries[key] = {
        iv: iv.toString("hex"),
        tag: tag.toString("hex"),
        data: encrypted,
      };
    }

    const vaultData: VaultData = {
      version: 1,
      salt: "static-v1",
      entries,
    };

    const dir = path.dirname(this.vaultFile);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.vaultFile, JSON.stringify(vaultData, null, 2), "utf-8");
  }
}
