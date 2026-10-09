import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

export interface BackupManifest {
  version: string;
  appVersion: string;
  createdAt: string;
  checksum: string;
  files: Array<{
    relativePath: string;
    size: number;
    sha256: string;
  }>;
}

export interface BackupArchive {
  manifest: BackupManifest;
  payload: Record<string, string>; // relativePath -> base64 content
}

export class BackupEngine {
  private readonly appDataDir: string;

  constructor(appDataDir: string) {
    this.appDataDir = path.resolve(appDataDir);
  }

  async createBackup(
    targetFilePath: string,
    options: { includeAudit: boolean; includeKnowledgeBase: boolean; includeSettings: boolean }
  ): Promise<BackupManifest> {
    const filesToInclude: string[] = [];

    // Helper to traverse directory safely
    const walk = async (currentDir: string): Promise<string[]> => {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            files.push(...(await walk(fullPath)));
          } else if (entry.isFile()) {
            files.push(fullPath);
          }
        }
        return files;
      } catch {
        return [];
      }
    };

    if (options.includeAudit) {
      const auditDir = path.join(this.appDataDir, "audit");
      filesToInclude.push(...(await walk(auditDir)));
    }

    if (options.includeKnowledgeBase) {
      const vectorDir = path.join(this.appDataDir, "vector");
      const graphDir = path.join(this.appDataDir, "graph");
      filesToInclude.push(...(await walk(vectorDir)));
      filesToInclude.push(...(await walk(graphDir)));
    }

    if (options.includeSettings) {
      const settingsFile = path.join(this.appDataDir, "settings.json");
      try {
        await fs.access(settingsFile);
        filesToInclude.push(settingsFile);
      } catch {
        // file doesn't exist
      }
    }

    const payload: Record<string, string> = {};
    const manifestFiles: BackupManifest["files"] = [];
    const overallHasher = createHash("sha256");

    for (const filePath of filesToInclude) {
      const relPath = path.relative(this.appDataDir, filePath);
      // Guard against traversal
      if (relPath.startsWith("..") || path.isAbsolute(relPath)) {
        continue;
      }

      const contentBuffer = await fs.readFile(filePath);
      const fileHash = createHash("sha256").update(contentBuffer).digest("hex");
      overallHasher.update(relPath).update(fileHash);

      manifestFiles.push({
        relativePath: relPath,
        size: contentBuffer.length,
        sha256: fileHash,
      });

      payload[relPath] = contentBuffer.toString("base64");
    }

    const overallChecksum = overallHasher.digest("hex");

    const manifest: BackupManifest = {
      version: "1.0",
      appVersion: "0.2.0-alpha.1",
      createdAt: new Date().toISOString(),
      checksum: overallChecksum,
      files: manifestFiles,
    };

    const archive: BackupArchive = {
      manifest,
      payload,
    };

    const destDir = path.dirname(path.resolve(targetFilePath));
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(targetFilePath, JSON.stringify(archive, null, 2), "utf-8");

    return manifest;
  }

  async verifyBackup(
    backupFilePath: string
  ): Promise<{ valid: boolean; manifest?: BackupManifest; error?: string }> {
    try {
      const content = await fs.readFile(backupFilePath, "utf-8");
      const archive: BackupArchive = JSON.parse(content);

      if (!archive.manifest || !archive.payload) {
        return { valid: false, error: "Invalid backup format: missing manifest or payload" };
      }

      const overallHasher = createHash("sha256");
      for (const item of archive.manifest.files) {
        // Path traversal validation
        const normalized = path.normalize(item.relativePath);
        const resolved = path.resolve(this.appDataDir, normalized);
        const appDataResolved = path.resolve(this.appDataDir);
        if (
          normalized.startsWith("..") ||
          path.isAbsolute(normalized) ||
          (resolved !== appDataResolved && !resolved.startsWith(appDataResolved + path.sep))
        ) {
          return {
            valid: false,
            error: `Malicious path detected in archive: ${item.relativePath}`,
          };
        }

        const base64Data = archive.payload[item.relativePath];
        if (!base64Data) {
          return { valid: false, error: `Missing file data for ${item.relativePath}` };
        }

        const buf = Buffer.from(base64Data, "base64");
        const hash = createHash("sha256").update(buf).digest("hex");
        if (hash !== item.sha256) {
          return { valid: false, error: `Checksum mismatch for file ${item.relativePath}` };
        }

        overallHasher.update(item.relativePath).update(hash);
      }

      const computedOverall = overallHasher.digest("hex");
      if (computedOverall !== archive.manifest.checksum) {
        return { valid: false, error: "Overall backup checksum mismatch" };
      }

      return { valid: true, manifest: archive.manifest };
    } catch (err: unknown) {
      return { valid: false, error: (err as Error).message };
    }
  }

  async restoreBackup(
    backupFilePath: string,
    overwrite = false
  ): Promise<{ restoredFiles: number }> {
    const verification = await this.verifyBackup(backupFilePath);
    if (!verification.valid || !verification.manifest) {
      throw new Error(`Backup verification failed: ${verification.error}`);
    }

    const content = await fs.readFile(backupFilePath, "utf-8");
    const archive: BackupArchive = JSON.parse(content);

    let restoredCount = 0;
    const appDataResolved = path.resolve(this.appDataDir);

    for (const item of verification.manifest.files) {
      const normalizedRelPath = path.normalize(item.relativePath);
      const targetPath = path.join(this.appDataDir, normalizedRelPath);
      const resolved = path.resolve(targetPath);

      // Verify the final resolved path is strictly within appDataDir
      if (
        normalizedRelPath.startsWith("..") ||
        path.isAbsolute(normalizedRelPath) ||
        (resolved !== appDataResolved && !resolved.startsWith(appDataResolved + path.sep))
      ) {
        throw new Error(`Security violation: Path escape detected for ${resolved}`);
      }

      if (!overwrite) {
        try {
          await fs.access(targetPath);
          continue; // skip existing if overwrite is false
        } catch {
          // not found, proceed
        }
      }

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const buf = Buffer.from(archive.payload[item.relativePath], "base64");
      await fs.writeFile(targetPath, buf);
      restoredCount++;
    }

    return { restoredFiles: restoredCount };
  }
}
