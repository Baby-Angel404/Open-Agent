import * as os from "node:os";
import * as fs from "node:fs";
import {
  AgentRuntime,
  PolicyEngine,
  CapabilityRegistry,
  ExecutorDispatcher,
  LocalAuditLogger,
  SessionManager,
  ScriptedPlanProvider,
  AgentAction,
} from "@open-agent/core";
import { getAuditLogPath } from "./audit.js";
import { loadPolicy } from "./policy.js";
import { getSessionStorePath, loadSessions } from "./session.js";

export function handleAgentStatus(): void {
  const auditPath = getAuditLogPath();
  const hasAuditLog = fs.existsSync(auditPath);
  const sessions = loadSessions();
  const activeSessions = sessions.filter(
    (s) => s.status === "RUNNING" || s.status === "WAITING_FOR_APPROVAL"
  );

  console.log("=== OpenAgent Infrastructure Status ===");
  console.log(`Platform:          ${os.platform()} (${os.arch()})`);
  console.log(`Node.js Version:   ${process.version}`);
  console.log(`Agent Runtime:     ONLINE (Phase 1 Local Runtime)`);
  console.log(`Policy Engine:     ONLINE (Deterministic evaluator active)`);
  console.log(`Security Default:  DEFAULT-DENY (Sensitive actions require explicit rules)`);
  console.log(`Telemetry / Cloud: DISABLED (100% Local-only operation)`);
  console.log(
    `Audit Store:       ${hasAuditLog ? "INITIALIZED (" + auditPath + ")" : "NOT INITIALIZED"}`
  );
  console.log(`Total Sessions:    ${sessions.length}`);
  console.log(`Active Sessions:   ${activeSessions.length}`);
}

export async function handleAgentStart(args: {
  task: string;
  agentId?: string;
  policyFile?: string;
  maxSteps?: number;
}): Promise<void> {
  const policy = loadPolicy(args.policyFile);
  const policyEngine = new PolicyEngine();
  const auditLogger = new LocalAuditLogger(getAuditLogPath());
  const sessionManager = new SessionManager(getSessionStorePath());
  const capabilityRegistry = new CapabilityRegistry();
  const dispatcher = new ExecutorDispatcher();

  // Create a realistic action plan derived from user task
  const initialPlan: AgentAction[] = [];
  const taskLower = args.task.toLowerCase();

  if (
    taskLower.includes("navigate") ||
    taskLower.includes("browse") ||
    taskLower.includes("open")
  ) {
    const target = args.task.match(/https?:\/\/[^\s]+/)?.[0] || "https://docs.openagent.org";
    initialPlan.push({
      type: "navigate",
      target,
      parameters: {},
    });
    initialPlan.push({
      type: "read",
      target,
      parameters: {},
    });
  } else if (taskLower.includes("download")) {
    const target =
      args.task.match(/https?:\/\/[^\s]+/)?.[0] || "https://docs.openagent.org/release.zip";
    initialPlan.push({
      type: "download",
      target,
      parameters: {},
    });
  } else if (taskLower.includes("shell") || taskLower.includes("exec")) {
    initialPlan.push({
      type: "shell_exec",
      target: "bash",
      parameters: { cmd: "whoami" },
    });
  } else {
    // Default safe exploration plan
    initialPlan.push({
      type: "navigate",
      target: "https://example.com",
      parameters: {},
    });
    initialPlan.push({
      type: "read",
      target: "https://example.com",
      parameters: {},
    });
  }

  const provider = new ScriptedPlanProvider(initialPlan);

  const runtime = new AgentRuntime({
    policyEngine,
    policy,
    capabilityRegistry,
    dispatcher,
    auditLogger,
    sessionManager,
    llmProvider: provider,
  });

  const session = runtime.startSession(args.task, args.agentId || "agent_local");
  console.log(`=== Agent Session Started ===`);
  console.log(`Session ID: ${session.id}`);
  console.log(`Task:       ${session.task}`);
  console.log(`Agent ID:   ${session.agentId}`);
  console.log(`Status:     ${session.status}`);
  console.log(`--------------------------------------------------------------------------------`);

  const maxSteps = args.maxSteps || 3;
  for (let i = 0; i < maxSteps; i++) {
    const stepRes = await runtime.step(session.id);
    console.log(`[Step ${i + 1}] Outcome: ${stepRes.outcome}`);
    if (stepRes.action) {
      console.log(
        `  Proposed Action:  ${stepRes.action.type} -> ${stepRes.action.target || "none"}`
      );
    }
    if (stepRes.decision) {
      console.log(`  Policy Decision:  ${stepRes.decision.decision} (${stepRes.decision.reason})`);
    }
    if (stepRes.result) {
      console.log(`  Execution Result: ${stepRes.result.status}`);
    }
    if (stepRes.error) {
      console.log(`  Error:            ${stepRes.error}`);
    }

    if (
      stepRes.outcome === "COMPLETED" ||
      stepRes.outcome === "FAILED" ||
      stepRes.outcome === "STOPPED" ||
      stepRes.outcome === "WAITING_FOR_APPROVAL" ||
      stepRes.outcome === "DENIED"
    ) {
      break;
    }
  }

  const finalSession = runtime.getSession(session.id);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`Final Session Status: ${finalSession?.status}`);
  console.log(`Total Actions Recorded in Audit: ${finalSession?.history.length}`);
}

export function handleAgentStop(args: { sessionId: string; reason?: string }): void {
  const policy = loadPolicy();
  const policyEngine = new PolicyEngine();
  const auditLogger = new LocalAuditLogger(getAuditLogPath());
  const sessionManager = new SessionManager(getSessionStorePath());
  const provider = new ScriptedPlanProvider([]);

  const runtime = new AgentRuntime({
    policyEngine,
    policy,
    auditLogger,
    sessionManager,
    llmProvider: provider,
  });

  const stopped = runtime.emergencyStop(
    args.sessionId,
    args.reason || "Operator CLI emergency stop"
  );
  console.log(`=== Emergency Stop Executed ===`);
  console.log(`Session ID: ${stopped.id}`);
  console.log(`Status:     ${stopped.status}`);
  console.log(`Ended At:   ${stopped.endedAt}`);
}
