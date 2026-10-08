import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { CredentialVault } from "../main/vault.js";
import { BackupEngine, BackupArchive } from "../main/backup.js";

describe("Phase 8: Security Boundaries and Isolation Suite", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openagent-security-test-"));
  });

  after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should encrypt secrets with AES-256-GCM and never leak plaintext to disk", async () => {
    const vaultDir = path.join(tempDir, "vault");
    const vault = new CredentialVault(vaultDir);
    await vault.initialize();

    const sensitiveApiKey = "sk-super-secret-production-token-12345678";
    await vault.setSecret("OPENAI_API_KEY", sensitiveApiKey);

    assert.strictEqual(await vault.hasSecret("OPENAI_API_KEY"), true);
    assert.strictEqual(await vault.getSecret("OPENAI_API_KEY"), sensitiveApiKey);

    // Read the raw file on disk and verify plaintext does not appear
    const rawFileContent = await fs.readFile(path.join(vaultDir, "vault.enc"), "utf-8");
    assert.strictEqual(
      rawFileContent.includes(sensitiveApiKey),
      false,
      "Raw vault file must NOT contain plaintext secret"
    );

    // Deletion
    const deleted = await vault.deleteSecret("OPENAI_API_KEY");
    assert.strictEqual(deleted, true);
    assert.strictEqual(await vault.hasSecret("OPENAI_API_KEY"), false);
  });

  it("should detect and reject path traversal attacks in backup archives", async () => {
    const backupEngine = new BackupEngine(path.join(tempDir, "data"));
    const maliciousArchive: BackupArchive = {
      manifest: {
        version: "1.0",
        appVersion: "0.1.0",
        createdAt: new Date().toISOString(),
        checksum: "fakechecksum",
        files: [
          {
            relativePath: "../../etc/passwd",
            size: 15,
            sha256: "fakehash",
          },
        ],
      },
      payload: {
        "../../etc/passwd": Buffer.from("root:x:0:0::/root:/bin/bash").toString("base64"),
      },
    };

    const maliciousFile = path.join(tempDir, "malicious-backup.json");
    await fs.writeFile(maliciousFile, JSON.stringify(maliciousArchive));

    const verifyResult = await backupEngine.verifyBackup(maliciousFile);
    assert.strictEqual(verifyResult.valid, false);
    assert.ok(verifyResult.error?.includes("Malicious path detected"));

    await assert.rejects(async () => {
      await backupEngine.restoreBackup(maliciousFile);
    }, /Backup verification failed/);
  });

  it("should detect tampering when backup archive content is modified", async () => {
    const testDataDir = path.join(tempDir, "source-data");
    const auditDir = path.join(testDataDir, "audit");
    await fs.mkdir(auditDir, { recursive: true });
    await fs.writeFile(path.join(auditDir, "test.log"), "legitimate log data", "utf-8");

    const engine = new BackupEngine(testDataDir);
    const backupPath = path.join(tempDir, "valid-backup.json");
    await engine.createBackup(backupPath, {
      includeAudit: true,
      includeKnowledgeBase: false,
      includeSettings: false,
    });

    const verifyBefore = await engine.verifyBackup(backupPath);
    assert.strictEqual(verifyBefore.valid, true);

    // Tamper with payload
    const rawBackup = JSON.parse(await fs.readFile(backupPath, "utf-8")) as BackupArchive;
    const firstKey = Object.keys(rawBackup.payload)[0];
    rawBackup.payload[firstKey] = Buffer.from("tampered payload").toString("base64");

    const tamperedPath = path.join(tempDir, "tampered-backup.json");
    await fs.writeFile(tamperedPath, JSON.stringify(rawBackup));

    const verifyAfter = await engine.verifyBackup(tamperedPath);
    assert.strictEqual(verifyAfter.valid, false);
    assert.ok(verifyAfter.error?.includes("Checksum mismatch"));
  });
});
