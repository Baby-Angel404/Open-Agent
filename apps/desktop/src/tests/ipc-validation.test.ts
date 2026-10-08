import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { SubsystemLifecycle } from "../main/lifecycle.js";
import { IPCDispatcher } from "../main/ipc/dispatcher.js";
import { IPC_CHANNELS, IPCResponse, SystemStatusData } from "../types/ipc.js";

describe("Phase 8: Desktop IPC Validation Suite", () => {
  let tempDir: string;
  let lifecycle: SubsystemLifecycle;
  let dispatcher: IPCDispatcher;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openagent-ipc-test-"));
    lifecycle = new SubsystemLifecycle(tempDir);
    await lifecycle.start();
    dispatcher = new IPCDispatcher(lifecycle);
  });

  after(async () => {
    await lifecycle.stop();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return operational system status on SYSTEM_GET_STATUS", async () => {
    const res = (await dispatcher.dispatch(
      IPC_CHANNELS.SYSTEM_GET_STATUS
    )) as IPCResponse<SystemStatusData>;
    assert.strictEqual(res.success, true);
    if (res.success) {
      assert.strictEqual(res.data.running, true);
      assert.strictEqual(res.data.subsystems.runtime, true);
      assert.strictEqual(res.data.subsystems.vector, true);
      assert.strictEqual(res.data.subsystems.graph, true);
      assert.strictEqual(res.data.subsystems.network, true);
      assert.strictEqual(res.data.subsystems.audit, true);
      assert.ok(res.data.loopbackGatewayUrl?.startsWith("http://127.0.0.1:"));
    }
  });

  it("should reject unknown or unauthorized IPC channel invocation", async () => {
    const res = await dispatcher.dispatch("system:evalMaliciousShell", {});
    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.strictEqual(res.error.code, "UNKNOWN_CHANNEL");
      assert.ok(res.error.message.includes("disallowed"));
    }
  });

  it("should reject empty goal in SESSION_CREATE", async () => {
    const res = await dispatcher.dispatch(IPC_CHANNELS.SESSION_CREATE, {
      goal: "  ",
      agentId: "test",
    });
    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.strictEqual(res.error.code, "INVALID_INPUT");
    }
  });

  it("should reject invalid protocols in BROWSER_NAVIGATE", async () => {
    const res = await dispatcher.dispatch(IPC_CHANNELS.BROWSER_NAVIGATE, {
      sessionId: "s1",
      url: "file:///etc/passwd",
    });
    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.strictEqual(res.error.code, "INVALID_URL");
    }
  });

  it("should reject RAG ingest with missing parameters", async () => {
    const res = await dispatcher.dispatch(IPC_CHANNELS.RAG_INGEST, { title: "", content: "" });
    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.strictEqual(res.error.code, "INVALID_INPUT");
    }
  });

  it("should read and update desktop settings", async () => {
    const getRes = await dispatcher.dispatch(IPC_CHANNELS.SETTINGS_GET);
    assert.strictEqual(getRes.success, true);

    const saveRes = await dispatcher.dispatch(IPC_CHANNELS.SETTINGS_SAVE, {
      general: {
        theme: "light",
        language: "en",
        autoCheckUpdates: true,
        startAtLogin: false,
        minimizeToTray: false,
      },
    });
    assert.strictEqual(saveRes.success, true);
  });
});
