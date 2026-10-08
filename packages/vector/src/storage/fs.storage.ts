import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { Collection, StorageManifest, VectorRecord } from "../types/index.js";

export const STORAGE_VERSION = "1.0.0";

export class CorruptedStorageError extends Error {
  constructor(message: string) {
    super(`[CorruptedStorage] ${message}`);
    this.name = "CorruptedStorageError";
  }
}

export class IncompatibleSchemaVersionError extends Error {
  constructor(expected: string, actual: string) {
    super(`Incompatible storage schema version: expected ${expected}, got ${actual}`);
    this.name = "IncompatibleSchemaVersionError";
  }
}

export interface IStorageBackend {
  saveManifest(manifest: StorageManifest): Promise<void>;
  loadManifest(): Promise<StorageManifest | null>;
  saveCollectionRecords(collectionId: string, records: VectorRecord[]): Promise<void>;
  loadCollectionRecords(collectionId: string): Promise<VectorRecord[]>;
  deleteCollection(collectionId: string): Promise<void>;
  close(): Promise<void>;
}

export class FileSystemStorageBackend implements IStorageBackend {
  private basePath: string;
  private manifestPath: string;
  private collectionsDir: string;

  constructor(basePath = "./.vector-store") {
    this.basePath = path.resolve(process.cwd(), basePath);
    this.manifestPath = path.join(this.basePath, "manifest.json");
    this.collectionsDir = path.join(this.basePath, "collections");

    if (!fs.existsSync(this.collectionsDir)) {
      fs.mkdirSync(this.collectionsDir, { recursive: true });
    }
  }

  getBasePath(): string {
    return this.basePath;
  }

  private atomicWrite(targetPath: string, data: string): void {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`;
    fs.writeFileSync(tmpPath, data, "utf-8");
    fs.renameSync(tmpPath, targetPath);
  }

  async saveManifest(manifest: StorageManifest): Promise<void> {
    const content = JSON.stringify(manifest, null, 2);
    this.atomicWrite(this.manifestPath, content);
  }

  async loadManifest(): Promise<StorageManifest | null> {
    if (!fs.existsSync(this.manifestPath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(this.manifestPath, "utf-8");
      const manifest = JSON.parse(raw) as StorageManifest;

      if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.collections)) {
        throw new CorruptedStorageError("Manifest format is malformed or invalid");
      }

      const majorExpected = STORAGE_VERSION.split(".")[0];
      const majorActual = (manifest.version || "").split(".")[0];
      if (majorActual !== majorExpected) {
        throw new IncompatibleSchemaVersionError(STORAGE_VERSION, manifest.version || "unknown");
      }

      return manifest;
    } catch (err: unknown) {
      if (err instanceof IncompatibleSchemaVersionError || err instanceof CorruptedStorageError) {
        throw err;
      }
      throw new CorruptedStorageError(
        `Failed to load manifest: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  public static validateCollectionId(collectionId: string): string {
    if (!collectionId || typeof collectionId !== "string") {
      throw new Error("Invalid collection ID: must be a non-empty string");
    }
    const trimmed = collectionId.trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed) || trimmed === "." || trimmed === "..") {
      throw new Error(
        `Security violation: Invalid or unsafe collection ID '${collectionId}'. Must match ^[a-zA-Z0-9_-]{1,64}$ without directory traversal symbols.`
      );
    }
    return trimmed;
  }

  private getCollectionRecordPath(collectionId: string): string {
    const safeId = FileSystemStorageBackend.validateCollectionId(collectionId);
    const targetDir = path.resolve(this.collectionsDir, safeId);
    if (!targetDir.startsWith(this.collectionsDir + path.sep)) {
      throw new Error(
        `Security violation: Path traversal escape detected for collection '${collectionId}'`
      );
    }
    return path.join(targetDir, "records.jsonl");
  }

  async saveCollectionRecords(collectionId: string, records: VectorRecord[]): Promise<void> {
    const filePath = this.getCollectionRecordPath(collectionId);
    const lines = records.map((r) => JSON.stringify(r)).join("\n");
    this.atomicWrite(filePath, lines ? lines + "\n" : "");
  }

  async loadCollectionRecords(collectionId: string): Promise<VectorRecord[]> {
    const filePath = this.getCollectionRecordPath(collectionId);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);
      const records: VectorRecord[] = [];

      for (let i = 0; i < lines.length; i++) {
        try {
          const rec = JSON.parse(lines[i]) as VectorRecord;
          if (!rec.id || !Array.isArray(rec.vector)) {
            throw new Error(`Invalid record structure at line ${i + 1}`);
          }
          records.push(rec);
        } catch (parseErr) {
          throw new CorruptedStorageError(
            `Corrupted record in collection '${collectionId}' at line ${i + 1}: ${
              parseErr instanceof Error ? parseErr.message : String(parseErr)
            }`
          );
        }
      }

      return records;
    } catch (err: unknown) {
      if (err instanceof CorruptedStorageError) {
        throw err;
      }
      throw new CorruptedStorageError(
        `Failed to load records for collection '${collectionId}': ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  async deleteCollection(collectionId: string): Promise<void> {
    const safeId = FileSystemStorageBackend.validateCollectionId(collectionId);
    const colDir = path.resolve(this.collectionsDir, safeId);
    if (!colDir.startsWith(this.collectionsDir + path.sep)) {
      throw new Error(
        `Security violation: Path traversal escape detected for collection '${collectionId}'`
      );
    }
    if (fs.existsSync(colDir)) {
      fs.rmSync(colDir, { recursive: true, force: true });
    }
  }

  async close(): Promise<void> {
    // Graceful close: no pending file locks
  }
}
