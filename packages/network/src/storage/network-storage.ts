import * as fs from "node:fs";
import * as path from "node:path";
import { Peer, Capability, ReputationRecord, NetworkStorageManifest } from "../types/index.js";

export const NETWORK_STORAGE_VERSION = "1.0.0";

export class CorruptedNetworkStorageError extends Error {
  constructor(message: string) {
    super(`[CorruptedNetworkStorage] ${message}`);
    this.name = "CorruptedNetworkStorageError";
  }
}

export class IncompatibleNetworkSchemaError extends Error {
  constructor(expected: string, actual: string) {
    super(`Incompatible network storage schema: expected ${expected}, got ${actual}`);
    this.name = "IncompatibleNetworkSchemaError";
  }
}

export interface NetworkStorageData {
  peers: Peer[];
  capabilities: Capability[];
  reputation: ReputationRecord[];
  blocklist: Array<{ agent_id: string; reason: string; timestamp: string }>;
}

export class NetworkStorage {
  private basePath: string;
  private manifestPath: string;
  private dataFilePath: string;

  constructor(basePath = "./.network-store") {
    this.basePath = path.resolve(process.cwd(), basePath);
    this.manifestPath = path.join(this.basePath, "manifest.json");
    this.dataFilePath = path.join(this.basePath, "network-data.json");

    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  getBasePath(): string {
    return this.basePath;
  }

  async save(agentId: string, data: NetworkStorageData): Promise<void> {
    const now = new Date().toISOString();
    const manifest: NetworkStorageManifest = {
      schema_version: NETWORK_STORAGE_VERSION,
      agent_id: agentId,
      total_peers: data.peers.length,
      total_capabilities: data.capabilities.length,
      total_reputation_records: data.reputation.length,
      blocked_peers: data.blocklist.length,
      updated_at: now,
    };

    // Atomic write data
    const tmpDataPath = `${this.dataFilePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpDataPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmpDataPath, this.dataFilePath);

    // Atomic write manifest
    const tmpManifestPath = `${this.manifestPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpManifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    fs.renameSync(tmpManifestPath, this.manifestPath);
  }

  async load(): Promise<NetworkStorageData | null> {
    if (!fs.existsSync(this.manifestPath) || !fs.existsSync(this.dataFilePath)) {
      return null;
    }

    try {
      const manifestRaw = fs.readFileSync(this.manifestPath, "utf-8");
      const manifest: NetworkStorageManifest = JSON.parse(manifestRaw);

      if (manifest.schema_version !== NETWORK_STORAGE_VERSION) {
        throw new IncompatibleNetworkSchemaError(NETWORK_STORAGE_VERSION, manifest.schema_version);
      }

      const dataRaw = fs.readFileSync(this.dataFilePath, "utf-8");
      const data: NetworkStorageData = JSON.parse(dataRaw);
      return data;
    } catch (err: unknown) {
      if (err instanceof IncompatibleNetworkSchemaError) throw err;
      throw new CorruptedNetworkStorageError(
        `Failed to parse network storage files: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  getManifest(): NetworkStorageManifest | null {
    if (!fs.existsSync(this.manifestPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.manifestPath, "utf-8"));
    } catch {
      return null;
    }
  }
}
