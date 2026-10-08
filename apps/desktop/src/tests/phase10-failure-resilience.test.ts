import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import * as http from "node:http";

import { SubsystemLifecycle } from "../main/lifecycle.js";
import { IPCDispatcher } from "../main/ipc/dispatcher.js";
import { IPC_CHANNELS, IPCResponse, BackupVerificationData } from "../types/ipc.js";
import {
  FileSystemStorageBackend,
  CorruptedStorageError,
  IncompatibleSchemaVersionError,
} from "@open-agent/vector";

describe("Phase 10: Resource and Failure Resilience Suite", () => {
  let tempDir: string;
  let lifecycle: SubsystemLifecycle;
  let dispatcher: IPCDispatcher;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openagent-failure-test-"));
    lifecycle = new SubsystemLifecycle(tempDir);
    await lifecycle.start();
    dispatcher = new IPCDispatcher(lifecycle);
  });

  after(async () => {
    if (lifecycle) {
      await lifecycle.stop();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // Failure 1: Corrupted local vector storage manifests and records
  it("Failure 1: Storage backend detects and reports corrupted manifest", async () => {
    const corruptedDir = path.join(tempDir, "corrupted-store");
    await fs.mkdir(corruptedDir, { recursive: true });
    await fs.writeFile(path.join(corruptedDir, "manifest.json"), "{ invalid JSON content", "utf-8");

    const storage = new FileSystemStorageBackend(corruptedDir);
    await assert.rejects(
      async () => {
        await storage.loadManifest();
      },
      (err: Error) => {
        return err.name === "CorruptedStorageError";
      }
    );
  });

  // Failure 2: Incompatible storage schema version
  it("Failure 2: Storage backend rejects incompatible schema version", async () => {
    const versionDir = path.join(tempDir, "version-store");
    await fs.mkdir(versionDir, { recursive: true });
    await fs.writeFile(
      path.join(versionDir, "manifest.json"),
      JSON.stringify({
        version: "99.0.0", // Incompatible version
        collections: [],
        totalRecords: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      "utf-8"
    );

    const storage = new FileSystemStorageBackend(versionDir);
    await assert.rejects(
      async () => {
        await storage.loadManifest();
      },
      (err: Error) => {
        return err.name === "IncompatibleSchemaVersionError";
      }
    );
  });

  // Failure 3: Malformed document import handling
  it("Failure 3: RAG Ingest rejects missing title or empty content gracefully", async () => {
    const emptyTitleRes = await dispatcher.dispatch(IPC_CHANNELS.RAG_INGEST, {
      title: "",
      content: "Valid content string",
    });
    assert.strictEqual(emptyTitleRes.success, false);
    if (!emptyTitleRes.success) {
      assert.strictEqual(emptyTitleRes.error.code, "INVALID_INPUT");
    }

    const emptyContentRes = await dispatcher.dispatch(IPC_CHANNELS.RAG_INGEST, {
      title: "Title",
      content: "",
    });
    assert.strictEqual(emptyContentRes.success, false);
    if (!emptyContentRes.success) {
      assert.strictEqual(emptyContentRes.error.code, "INVALID_INPUT");
    }
  });

  // Failure 4: Unreachable peer invocation fails gracefully
  it("Failure 4: Unreachable peer invocation reports accurate failure without crashing", async () => {
    const res = await dispatcher.dispatch(IPC_CHANNELS.NETWORK_INVOKE_REMOTE, {
      peerId: "unreachable_peer_999",
      capabilityName: "document.search@1.0",
      params: { query: "test" },
    });

    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.ok(res.error.code);
      assert.ok(
        res.error.message.includes("peer") ||
          res.error.message.includes("not found") ||
          res.error.message.includes("unreachable")
      );
    }
  });

  // Failure 5: Interrupted or tampered backup restore is rejected
  it("Failure 5: Interrupted or tampered backup restore fails closed", async () => {
    const tamperedBackupFile = path.join(tempDir, "tampered-backup.json");
    await fs.writeFile(
      tamperedBackupFile,
      JSON.stringify({
        manifest: {
          version: "1.0",
          appVersion: "0.1.0",
          createdAt: new Date().toISOString(),
          checksum: "mismatched_checksum_1234",
          files: [
            {
              relativePath: "data/file.txt",
              size: 10,
              sha256: "fake_hash_value",
            },
          ],
        },
        payload: {
          "data/file.txt": Buffer.from("hello").toString("base64"),
        },
      }),
      "utf-8"
    );

    const verifyRes = (await dispatcher.dispatch(IPC_CHANNELS.BACKUP_VERIFY, {
      backupFilePath: tamperedBackupFile,
    })) as IPCResponse<BackupVerificationData>;

    assert.strictEqual(verifyRes.success, false);

    const restoreRes = await dispatcher.dispatch(IPC_CHANNELS.BACKUP_RESTORE, {
      backupFilePath: tamperedBackupFile,
      overwriteExisting: true,
    });
    assert.strictEqual(restoreRes.success, false);
  });

  // Failure 6: Rate limit exhaustion on local API server
  it("Failure 6: Rate limit exhaustion enforces HTTP 429", async () => {
    const port = lifecycle.getApiPort();
    assert.ok(port > 0);

    // Make rapid requests to exceed rate limit window (maxRequestsPerWindow = 200)
    let rateLimitedOccurred = false;
    for (let i = 0; i < 210; i++) {
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/health",
            method: "GET",
            headers: { Host: `127.0.0.1:${port}` },
          },
          (res) => resolve(res.statusCode || 0)
        );
        req.on("error", reject);
        req.end();
      });
      if (status === 429) {
        rateLimitedOccurred = true;
        break;
      }
    }

    assert.strictEqual(rateLimitedOccurred, true);
  });

  // Failure 7: Application shutdown during active operations releases resources
  it("Failure 7: Graceful shutdown halts gateway and closes ports cleanly", async () => {
    const ephemeralDir = await fs.mkdtemp(path.join(os.tmpdir(), "ephemeral-lifecycle-"));
    const tempLifecycle = new SubsystemLifecycle(ephemeralDir);
    await tempLifecycle.start();
    const port = tempLifecycle.getApiPort();
    assert.ok(port > 0);

    // Shutdown
    await tempLifecycle.stop();

    // Verify port is closed
    const isPortClosed = await new Promise<boolean>((resolve) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/health",
          method: "GET",
          timeout: 500,
        },
        () => resolve(false)
      );
      req.on("error", () => resolve(true));
      req.end();
    });

    assert.strictEqual(isPortClosed, true);
    await fs.rm(ephemeralDir, { recursive: true, force: true });
  });
});
