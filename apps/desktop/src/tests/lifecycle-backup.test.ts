import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { SubsystemLifecycle } from "../main/lifecycle.js";
import { IPCDispatcher } from "../main/ipc/dispatcher.js";
import {
  IPC_CHANNELS,
  IPCResponse,
  SystemStatusData,
  BackupVerificationData,
} from "../types/ipc.js";

describe("Phase 8: Subsystem Lifecycle & Backup Restore Suite", () => {
  let tempDir: string;
  let lifecycle: SubsystemLifecycle;
  let dispatcher: IPCDispatcher;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openagent-lifecycle-test-"));
    lifecycle = new SubsystemLifecycle(tempDir);
    await lifecycle.start();
    dispatcher = new IPCDispatcher(lifecycle);
  });

  after(async () => {
    await lifecycle.stop();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should initialize all 6 real subsystems and report operational health", async () => {
    const status = (await dispatcher.dispatch(
      IPC_CHANNELS.SYSTEM_GET_STATUS
    )) as IPCResponse<SystemStatusData>;
    assert.strictEqual(status.success, true);
    if (status.success) {
      assert.strictEqual(status.data.running, true);
      assert.strictEqual(status.data.subsystems.runtime, true);
      assert.strictEqual(status.data.subsystems.vector, true);
      assert.strictEqual(status.data.subsystems.graph, true);
      assert.strictEqual(status.data.subsystems.network, true);
      assert.strictEqual(status.data.subsystems.audit, true);
      assert.strictEqual(status.data.subsystems.gateway, true);
    }
  });

  it("should execute agent task and generate audit trail", async () => {
    const createRes = (await dispatcher.dispatch(IPC_CHANNELS.SESSION_CREATE, {
      agentId: "test_desktop_agent",
      goal: "Analyze secure local logs and verify system stability",
    })) as IPCResponse<{ sessionId: string }>;

    assert.strictEqual(createRes.success, true);
    if (createRes.success) {
      const sessionId = createRes.data.sessionId;
      assert.ok(sessionId);

      // Execute step
      const stepRes = await dispatcher.dispatch(IPC_CHANNELS.SESSION_RUN_TASK, {
        sessionId,
        task: "step",
      });
      assert.strictEqual(stepRes.success, true);

      // Verify audit history
      const historyRes = (await dispatcher.dispatch(IPC_CHANNELS.SESSION_GET_HISTORY, {
        sessionId,
      })) as IPCResponse<{ events: unknown[] }>;
      assert.strictEqual(historyRes.success, true);
      if (historyRes.success) {
        assert.ok(historyRes.data.events.length >= 1);
      }
    }
  });

  it("should ingest document into vector & graph and answer query", async () => {
    const ingestRes = (await dispatcher.dispatch(IPC_CHANNELS.RAG_INGEST, {
      title: "OpenAgent Protocol Spec",
      content:
        "OpenAgent provides decentralized capability discovery and local hybrid vector retrieval.",
    })) as IPCResponse<{ ingested: boolean; chunksCount: number }>;

    assert.strictEqual(ingestRes.success, true);
    if (ingestRes.success) {
      assert.strictEqual(ingestRes.data.ingested, true);
      assert.ok(ingestRes.data.chunksCount >= 1);
    }

    // Query RAG
    const queryRes = (await dispatcher.dispatch(IPC_CHANNELS.RAG_QUERY, {
      query: "decentralized capability discovery",
    })) as IPCResponse<{ answer: string; sources: unknown[] }>;

    assert.strictEqual(queryRes.success, true);
    if (queryRes.success) {
      assert.ok(queryRes.data.sources.length >= 1);
    }
  });

  it("should perform complete backup creation, verification, and restore cycle", async () => {
    const backupFilePath = path.join(tempDir, "desktop-full-backup.json");

    // 1. Create backup
    const backupRes = (await dispatcher.dispatch(IPC_CHANNELS.BACKUP_CREATE, {
      destinationPath: backupFilePath,
      includeAuditLogs: true,
      includeKnowledgeBase: true,
    })) as IPCResponse<{ created: boolean; checksum: string }>;

    assert.strictEqual(backupRes.success, true);
    if (backupRes.success) {
      assert.strictEqual(backupRes.data.created, true);
      assert.ok(backupRes.data.checksum);
    }

    // 2. Verify backup
    const verifyRes = (await dispatcher.dispatch(IPC_CHANNELS.BACKUP_VERIFY, {
      backupFilePath,
    })) as IPCResponse<BackupVerificationData>;

    assert.strictEqual(verifyRes.success, true);
    if (verifyRes.success) {
      assert.strictEqual(verifyRes.data.valid, true);
    }

    // 3. Restore backup
    const restoreRes = (await dispatcher.dispatch(IPC_CHANNELS.BACKUP_RESTORE, {
      backupFilePath,
      overwriteExisting: true,
    })) as IPCResponse<{ restored: boolean; restoredFilesCount: number }>;

    assert.strictEqual(restoreRes.success, true);
    if (restoreRes.success) {
      assert.strictEqual(restoreRes.data.restored, true);
      assert.ok(restoreRes.data.restoredFilesCount >= 1);
    }
  });
});
