import test from "node:test";
import assert from "node:assert";
import { AgentRuntime } from "../runtime/runtime.js";
import { PolicyEngine } from "../policy/engine.js";
import { Policy } from "../types/policy.js";
import { ScriptedPlanProvider } from "../llm/scripted.provider.js";
import { CapabilityRegistry } from "../capability/registry.js";
import { ExecutorDispatcher } from "../executor/dispatcher.js";
import { LocalAuditLogger } from "../audit/logger.js";
import { SessionManager } from "../session/manager.js";
import { AgentAction } from "../types/action.js";
import { LocalAPIServer } from "../api/server.js";

const testPolicy: Policy = {
  id: "runtime_test_policy",
  name: "Runtime Test Policy",
  version: "1.0.0",
  defaultDecision: "DENY",
  allowedDomains: ["docs.example.com"],
  rules: [
    {
      id: "allow_nav",
      actionType: "navigate",
      decision: "ALLOW",
      targetPattern: "*",
      description: "Allow navigation to allowed domains",
    },
    {
      id: "ask_download",
      actionType: "download",
      decision: "ASK_USER",
      description: "Ask before downloading files",
    },
    {
      id: "deny_upload",
      actionType: "upload",
      decision: "DENY",
      description: "Disallow uploading data",
    },
  ],
};

function createTestRuntime(plan: AgentAction[] = []): {
  runtime: AgentRuntime;
  auditLogger: LocalAuditLogger;
  provider: ScriptedPlanProvider;
} {
  const policyEngine = new PolicyEngine();
  const provider = new ScriptedPlanProvider(plan);
  const auditLogger = new LocalAuditLogger();
  const sessionManager = new SessionManager();
  const capabilityRegistry = new CapabilityRegistry();
  const dispatcher = new ExecutorDispatcher();

  const runtime = new AgentRuntime({
    policyEngine,
    policy: testPolicy,
    capabilityRegistry,
    dispatcher,
    auditLogger,
    sessionManager,
    llmProvider: provider,
  });

  return { runtime, auditLogger, provider };
}

test("1. Full security flow: Task -> Propose -> Policy -> Allowed action executes", async () => {
  const plan: AgentAction[] = [
    {
      id: "act_1",
      sessionId: "will_be_overwritten",
      type: "navigate",
      target: "https://docs.example.com/guide",
      parameters: {},
      timestamp: new Date().toISOString(),
      agentId: "test_agent",
    },
  ];

  const { runtime, auditLogger } = createTestRuntime(plan);
  const session = runtime.startSession("Read documentation");
  assert.strictEqual(session.status, "RUNNING");

  const stepResult = await runtime.step(session.id);
  assert.strictEqual(stepResult.outcome, "EXECUTED");
  assert.strictEqual(stepResult.decision?.decision, "ALLOW");
  assert.strictEqual(stepResult.result?.status, "SUCCESS");

  // Verify Audit Log events
  const auditEntries = auditLogger.getEntries();
  const stages = auditEntries.map((e) => e.stage);
  assert.ok(stages.includes("ACTION_PROPOSED"));
  assert.ok(stages.includes("POLICY_EVALUATED"));
  assert.ok(stages.includes("ACTION_ALLOWED"));
  assert.ok(stages.includes("ACTION_EXECUTED"));
  assert.strictEqual(auditLogger.verifyIntegrity(), true);
});

test("2. Denied action: Executor is never called and session marks failed", async () => {
  const plan: AgentAction[] = [
    {
      id: "act_denied",
      sessionId: "s1",
      type: "upload",
      target: "https://docs.example.com/data",
      parameters: { file: "secret.txt" },
      timestamp: new Date().toISOString(),
      agentId: "test_agent",
    },
  ];

  const { runtime, auditLogger } = createTestRuntime(plan);
  const session = runtime.startSession("Attempt unauthorized upload");
  const stepResult = await runtime.step(session.id);

  assert.strictEqual(stepResult.outcome, "DENIED");
  assert.strictEqual(stepResult.decision?.decision, "DENY");
  assert.strictEqual(stepResult.result?.status, "BLOCKED");

  const updatedSession = runtime.getSession(session.id);
  assert.strictEqual(updatedSession?.status, "FAILED");

  // Ensure executor was not called; audit confirms ACTION_DENIED
  const auditEntries = auditLogger.getEntries();
  assert.ok(auditEntries.some((e) => e.stage === "ACTION_DENIED"));
  assert.ok(!auditEntries.some((e) => e.stage === "ACTION_EXECUTED"));
});

test("3. ASK_USER: Runtime pauses and waits for user approval", async () => {
  const plan: AgentAction[] = [
    {
      id: "act_ask",
      sessionId: "s2",
      type: "download",
      target: "https://docs.example.com/archive.zip",
      parameters: {},
      timestamp: new Date().toISOString(),
      agentId: "test_agent",
    },
  ];

  const { runtime } = createTestRuntime(plan);
  const session = runtime.startSession("Download archive");
  const stepResult = await runtime.step(session.id);

  assert.strictEqual(stepResult.outcome, "WAITING_FOR_APPROVAL");
  const updatedSession = runtime.getSession(session.id);
  assert.strictEqual(updatedSession?.status, "WAITING_FOR_APPROVAL");
  assert.strictEqual(updatedSession?.pendingAction?.id, "act_ask");

  // User Approves
  const approvalResult = await runtime.respondToApproval(session.id, "APPROVE");
  assert.strictEqual(approvalResult.outcome, "EXECUTED");
  assert.strictEqual(approvalResult.result?.status, "SUCCESS");

  const completedSession = runtime.getSession(session.id);
  assert.strictEqual(completedSession?.status, "RUNNING");
  assert.strictEqual(completedSession?.pendingAction, undefined);
});

test("4. User denies prompt: Action does not execute", async () => {
  const plan: AgentAction[] = [
    {
      id: "act_ask_2",
      sessionId: "s3",
      type: "download",
      target: "https://docs.example.com/sensitive.zip",
      parameters: {},
      timestamp: new Date().toISOString(),
      agentId: "test_agent",
    },
  ];

  const { runtime, auditLogger } = createTestRuntime(plan);
  const session = runtime.startSession("Download sensitive archive");
  await runtime.step(session.id);

  const approvalResult = await runtime.respondToApproval(session.id, "DENY");
  assert.strictEqual(approvalResult.outcome, "DENIED");

  const auditEntries = auditLogger.getEntries();
  assert.ok(auditEntries.some((e) => e.stage === "APPROVAL_REJECTED"));
  assert.ok(!auditEntries.some((e) => e.stage === "ACTION_EXECUTED"));
});

test("5. Emergency stop: Cancels active session and blocks execution", async () => {
  const plan: AgentAction[] = [
    {
      id: "act_nav_pending",
      sessionId: "s4",
      type: "navigate",
      target: "https://docs.example.com/guide",
      parameters: {},
      timestamp: new Date().toISOString(),
      agentId: "test_agent",
    },
  ];

  const { runtime, auditLogger } = createTestRuntime(plan);
  const session = runtime.startSession("Long running task");

  // Emergency stop triggered before step
  runtime.emergencyStop(session.id, "Operator pressed kill switch");

  const stepResult = await runtime.step(session.id);
  assert.strictEqual(stepResult.outcome, "STOPPED");

  const stoppedSession = runtime.getSession(session.id);
  assert.strictEqual(stoppedSession?.status, "STOPPED");

  const auditEntries = auditLogger.getEntries();
  assert.ok(auditEntries.some((e) => e.stage === "SESSION_STOPPED"));
  assert.ok(!auditEntries.some((e) => e.stage === "ACTION_EXECUTED"));
});

test("6. Unknown capability: Request is rejected and session marked failed", async () => {
  const plan: AgentAction[] = [
    {
      id: "act_alien",
      sessionId: "s5",
      type: "quantum_teleport", // Unregistered capability
      target: "core://memory",
      parameters: {},
      timestamp: new Date().toISOString(),
      agentId: "test_agent",
    },
  ];

  const { runtime, auditLogger } = createTestRuntime(plan);
  const session = runtime.startSession("Run alien capability");
  const stepResult = await runtime.step(session.id);

  assert.strictEqual(stepResult.outcome, "FAILED");
  assert.match(stepResult.error || "", /not registered in capability registry/);

  const auditEntries = auditLogger.getEntries();
  assert.ok(auditEntries.some((e) => e.stage === "ACTION_FAILED"));
});

test("7. Secret redaction: Audit log redacts passwords and bearer tokens", async () => {
  const plan: AgentAction[] = [
    {
      id: "act_auth",
      sessionId: "s6",
      type: "navigate",
      target: "https://docs.example.com/login",
      parameters: {
        password: "SuperSecretPassword123!",
        apiKey: "sk-abcdef1234567890123456",
        token: "Bearer secret-token-value-xyz",
      },
      timestamp: new Date().toISOString(),
      agentId: "test_agent",
    },
  ];

  const { runtime, auditLogger } = createTestRuntime(plan);
  const session = runtime.startSession("Login operation");
  await runtime.step(session.id);

  const auditEntries = auditLogger.getEntries();
  const proposedEvent = auditEntries.find(
    (e) => e.stage === "ACTION_PROPOSED" && e.action === "navigate"
  );
  assert.ok(proposedEvent);

  const rawJSON = JSON.stringify(proposedEvent);
  // Ensure actual raw secrets are NOT present
  assert.ok(!rawJSON.includes("SuperSecretPassword123!"));
  assert.ok(!rawJSON.includes("sk-abcdef1234567890123456"));
  assert.ok(rawJSON.includes("[REDACTED]"));
});

test("8. Local API server handles /api/v1 endpoints", async () => {
  const { runtime, auditLogger } = createTestRuntime();
  const apiServer = new LocalAPIServer({ runtime, auditLogger });
  const port = await apiServer.listen(0);

  try {
    // 1. GET /api/v1/agents
    const agentsRes = await fetch(`http://localhost:${port}/api/v1/agents`);
    assert.strictEqual(agentsRes.status, 200);
    const agentsData = (await agentsRes.json()) as { success: boolean };
    assert.strictEqual(agentsData.success, true);

    // 2. POST /api/v1/sessions
    const createRes = await fetch(`http://localhost:${port}/api/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "API Test Task" }),
    });
    assert.strictEqual(createRes.status, 201);
    const sessionData = (await createRes.json()) as { success: boolean; data: { id: string } };
    const sessId = sessionData.data.id;

    // 3. POST /api/v1/sessions/:id/stop
    const stopRes = await fetch(`http://localhost:${port}/api/v1/sessions/${sessId}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "API stop test" }),
    });
    assert.strictEqual(stopRes.status, 200);

    // 4. GET /api/v1/audit
    const auditRes = await fetch(`http://localhost:${port}/api/v1/audit`);
    assert.strictEqual(auditRes.status, 200);
    const auditData = (await auditRes.json()) as { success: boolean; data: unknown[] };
    assert.ok(auditData.data.length > 0);
  } finally {
    await apiServer.close();
  }
});
