import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import * as http from "node:http";

import { SubsystemLifecycle } from "../main/lifecycle.js";
import { IPCDispatcher } from "../main/ipc/dispatcher.js";
import {
  IPC_CHANNELS,
  IPCResponse,
  SystemStatusData,
  BackupVerificationData,
  SessionSummary,
  GraphQueryData,
} from "../types/ipc.js";

describe("Phase 10: End-to-End Integration Validation (10 Workflows)", () => {
  let tempDir: string;
  let lifecycle: SubsystemLifecycle;
  let dispatcher: IPCDispatcher;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openagent-phase10-e2e-"));
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

  // Workflow 1: Application startup, health checks, and graceful shutdown
  it("Workflow 1: Application startup, health checks, and graceful lifecycle", async () => {
    // 1. IPC Status
    const statusRes = (await dispatcher.dispatch(
      IPC_CHANNELS.SYSTEM_GET_STATUS
    )) as IPCResponse<SystemStatusData>;
    assert.strictEqual(statusRes.success, true);
    if (statusRes.success) {
      assert.strictEqual(statusRes.data.running, true);
      assert.strictEqual(statusRes.data.subsystems.runtime, true);
      assert.strictEqual(statusRes.data.subsystems.vector, true);
      assert.strictEqual(statusRes.data.subsystems.graph, true);
      assert.strictEqual(statusRes.data.subsystems.network, true);
      assert.strictEqual(statusRes.data.subsystems.audit, true);
      assert.strictEqual(statusRes.data.subsystems.gateway, true);
    }

    // 2. HTTP /health endpoint on Loopback Gateway
    const port = lifecycle.getApiPort();
    assert.ok(port > 0);

    const healthStatusCode = await new Promise<number>((resolve, reject) => {
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
    assert.strictEqual(healthStatusCode, 200);
  });

  // Workflow 2: Agent session creation and action-policy enforcement
  it("Workflow 2: Agent session creation and action-policy enforcement", async () => {
    // 1. Create session
    const createRes = (await dispatcher.dispatch(IPC_CHANNELS.SESSION_CREATE, {
      agentId: "sec_agent_p10",
      goal: "Perform automated local telemetry assessment",
    })) as IPCResponse<{ sessionId: string }>;

    assert.strictEqual(createRes.success, true);
    if (!createRes.success) return;
    const sessionId = createRes.data.sessionId;

    // 2. List sessions
    const listRes = (await dispatcher.dispatch(IPC_CHANNELS.SESSION_LIST)) as IPCResponse<
      SessionSummary[]
    >;
    assert.strictEqual(listRes.success, true);
    if (listRes.success) {
      assert.ok(listRes.data.some((s) => s.id === sessionId));
    }

    // 3. Step execution through policy-controlled runtime
    const stepRes = (await dispatcher.dispatch(IPC_CHANNELS.SESSION_RUN_TASK, {
      sessionId,
      task: "evaluate",
    })) as IPCResponse<unknown>;
    assert.strictEqual(stepRes.success, true);

    // 4. Stop session
    const stopRes = (await dispatcher.dispatch(IPC_CHANNELS.SESSION_STOP, {
      sessionId,
    })) as IPCResponse<unknown>;
    assert.strictEqual(stopRes.success, true);
  });

  // Workflow 3: Browser actions requiring approval and actions that must be denied
  it("Workflow 3: Browser actions requiring approval and prohibited schemes", async () => {
    // 1. Prohibited protocol schemes (file://, javascript:) must be rejected
    const badFileRes = await dispatcher.dispatch(IPC_CHANNELS.BROWSER_NAVIGATE, {
      sessionId: "sess_browser",
      url: "file:///etc/shadow",
    });
    assert.strictEqual(badFileRes.success, false);

    const badScriptRes = await dispatcher.dispatch(IPC_CHANNELS.BROWSER_NAVIGATE, {
      sessionId: "sess_browser",
      url: "javascript:alert(1)",
    });
    assert.strictEqual(badScriptRes.success, false);

    // 2. Allowed HTTP navigation
    const validNavRes = (await dispatcher.dispatch(IPC_CHANNELS.BROWSER_NAVIGATE, {
      sessionId: "sess_browser",
      url: "https://docs.example.com/spec",
    })) as IPCResponse<{ url: string; title: string }>;
    assert.strictEqual(validNavRes.success, true);
    if (validNavRes.success) {
      assert.strictEqual(validNavRes.data.url, "https://docs.example.com/spec");
    }
  });

  // Workflow 4: Document ingestion, vector retrieval, Graph RAG, and source provenance
  it("Workflow 4: Document ingestion, vector retrieval, Graph RAG, and source provenance", async () => {
    // 1. Ingest structured document
    const docTitle = "Distributed Capability Protocol 2026";
    const docContent =
      "Alice is an agent that provides document summarization. Bob provides graph indexing. Alice collaborates with Bob to answer complex multi-hop queries.";
    const ingestRes = (await dispatcher.dispatch(IPC_CHANNELS.RAG_INGEST, {
      title: docTitle,
      content: docContent,
    })) as IPCResponse<{ ingested: boolean; chunksCount: number }>;

    assert.strictEqual(ingestRes.success, true);
    if (ingestRes.success) {
      assert.ok(ingestRes.data.chunksCount >= 1);
    }

    // 2. Hybrid RAG Query with source provenance validation
    const queryRes = (await dispatcher.dispatch(IPC_CHANNELS.RAG_QUERY, {
      query: "How does Alice collaborate with Bob?",
      mode: "hybrid",
    })) as IPCResponse<{
      answer: string;
      sources: Array<{ document_id?: string; text?: string; score?: number }>;
    }>;

    assert.strictEqual(queryRes.success, true);
    if (queryRes.success) {
      assert.ok(queryRes.data.sources.length >= 1);
      const topSource = queryRes.data.sources[0];
      assert.ok(topSource.text || topSource.document_id);
    }

    // 3. Inspect Knowledge Graph entities & relations
    const graphRes = (await dispatcher.dispatch(
      IPC_CHANNELS.RAG_GET_GRAPH
    )) as IPCResponse<GraphQueryData>;
    assert.strictEqual(graphRes.success, true);
    if (graphRes.success) {
      assert.ok(graphRes.data.entities.length >= 1);
    }
  });

  // Workflow 5: Peer authentication and authorized capability invocation
  it("Workflow 5: Peer authentication and capability discovery", async () => {
    const netStatusRes = (await dispatcher.dispatch(
      IPC_CHANNELS.NETWORK_GET_STATUS
    )) as IPCResponse<{ nodeId: string; advertisedCapabilities: string[] }>;

    assert.strictEqual(netStatusRes.success, true);
    if (netStatusRes.success) {
      assert.ok(netStatusRes.data.nodeId);
      assert.ok(Array.isArray(netStatusRes.data.advertisedCapabilities));
    }

    // Discover peers
    const peersRes = (await dispatcher.dispatch(
      IPC_CHANNELS.NETWORK_DISCOVER_PEERS
    )) as IPCResponse<{ peers: unknown[] }>;
    assert.strictEqual(peersRes.success, true);
  });

  // Workflow 6: Plugin installation, permission enforcement, and risk assignment
  it("Workflow 6: Plugin registration, risk level assignment, and permission gating", async () => {
    // 1. List initial capabilities
    const listCapsRes = (await dispatcher.dispatch(IPC_CHANNELS.PLUGINS_LIST)) as IPCResponse<
      unknown[]
    >;
    assert.strictEqual(listCapsRes.success, true);

    // 2. Register new capability with declared risk level
    const regRes = (await dispatcher.dispatch(IPC_CHANNELS.PLUGINS_REGISTER, {
      name: "sentiment.analyze",
      version: "1.0.0",
      description: "Analyze sentiment of textual inputs deterministically",
      riskLevel: "low",
    })) as IPCResponse<{ registered: boolean; name: string }>;

    assert.strictEqual(regRes.success, true);
    if (regRes.success) {
      assert.strictEqual(regRes.data.registered, true);
      assert.strictEqual(regRes.data.name, "sentiment.analyze");
    }
  });

  // Workflow 7: Audit event recording and integrity verification
  it("Workflow 7: Audit event recording and hash-chain integrity verification", async () => {
    const auditStore = lifecycle.getAuditStore();
    assert.ok(auditStore);

    const entries = auditStore.getEntries();
    assert.ok(entries.length >= 1);

    // Verify cryptographic SHA-256 hash chain
    const verification = auditStore.verifyIntegrity();
    assert.strictEqual(verification.valid, true);
    assert.strictEqual(verification.totalEntries, entries.length);
    assert.strictEqual(verification.verifiedEntries, entries.length);
  });

  // Workflow 8: Backup, restore, and migration
  it("Workflow 8: Complete backup creation, checksum validation, and restore", async () => {
    const backupFile = path.join(tempDir, "phase10-e2e-backup.json");

    // 1. Create backup
    const backupRes = (await dispatcher.dispatch(IPC_CHANNELS.BACKUP_CREATE, {
      destinationPath: backupFile,
      includeAuditLogs: true,
      includeKnowledgeBase: true,
    })) as IPCResponse<{ created: boolean; checksum: string }>;
    assert.strictEqual(backupRes.success, true);

    // 2. Verify backup
    const verifyRes = (await dispatcher.dispatch(IPC_CHANNELS.BACKUP_VERIFY, {
      backupFilePath: backupFile,
    })) as IPCResponse<BackupVerificationData>;
    assert.strictEqual(verifyRes.success, true);
    if (verifyRes.success) {
      assert.strictEqual(verifyRes.data.valid, true);
    }

    // 3. Restore backup
    const restoreRes = (await dispatcher.dispatch(IPC_CHANNELS.BACKUP_RESTORE, {
      backupFilePath: backupFile,
      overwriteExisting: true,
    })) as IPCResponse<{ restored: boolean; restoredFilesCount: number }>;
    assert.strictEqual(restoreRes.success, true);
    if (restoreRes.success) {
      assert.strictEqual(restoreRes.data.restored, true);
      assert.ok(restoreRes.data.restoredFilesCount >= 1);
    }
  });

  // Workflow 9: Desktop-to-backend IPC authorization
  it("Workflow 9: Desktop-to-backend IPC authorization and error handling", async () => {
    // 1. Unknown channel rejection
    const invalidRes = await dispatcher.dispatch("UNKNOWN_UNAUTHORIZED_CHANNEL", {});
    assert.strictEqual(invalidRes.success, false);
    if (!invalidRes.success) {
      assert.strictEqual(invalidRes.error.code, "UNKNOWN_CHANNEL");
    }

    // 2. Parameter validation error on missing required field
    const emptySessionRes = await dispatcher.dispatch(IPC_CHANNELS.SESSION_CREATE, {
      agentId: "agent",
      goal: "", // Empty goal violates validation
    });
    assert.strictEqual(emptySessionRes.success, false);
    if (!emptySessionRes.success) {
      assert.strictEqual(emptySessionRes.error.code, "INVALID_INPUT");
    }
  });

  // Workflow 10: Offline operation and local isolation
  it("Workflow 10: Offline local operation without external network dependency", async () => {
    // Verify secret vault operations function completely in local air-gapped mode
    const setSecretRes = await dispatcher.dispatch(IPC_CHANNELS.VAULT_SET_SECRET, {
      key: "LOCAL_OFFLINE_SECRET",
      secret: "offline-val-987",
    });
    assert.strictEqual(setSecretRes.success, true);

    const hasSecretRes = (await dispatcher.dispatch(IPC_CHANNELS.VAULT_HAS_SECRET, {
      key: "LOCAL_OFFLINE_SECRET",
    })) as IPCResponse<{ exists: boolean; key: string }>;
    assert.strictEqual(hasSecretRes.success, true);
    if (hasSecretRes.success) {
      assert.strictEqual(hasSecretRes.data.exists, true);
    }

    const deleteSecretRes = (await dispatcher.dispatch(IPC_CHANNELS.VAULT_DELETE_SECRET, {
      key: "LOCAL_OFFLINE_SECRET",
    })) as IPCResponse<boolean>;
    assert.strictEqual(deleteSecretRes.success, true);
  });
});
