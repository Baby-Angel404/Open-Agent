import * as crypto from "node:crypto";
import { AgentAction, ActionResult } from "../types/action.js";
import { Session, SessionStatus } from "../types/agent.js";
import { Policy, PolicyDecision } from "../types/policy.js";
import { ApprovedAction } from "../types/executor.js";
import { LLMProvider } from "../types/llm.js";
import { PolicyEngine } from "../policy/engine.js";
import { validateAction } from "../policy/validator.js";
import { CapabilityRegistry, UnknownCapabilityError } from "../capability/registry.js";
import { ExecutorDispatcher, SecurityViolationError } from "../executor/dispatcher.js";
import { LocalAuditLogger } from "../audit/logger.js";
import { SessionManager } from "../session/manager.js";

export type StepOutcome =
  "EXECUTED" | "WAITING_FOR_APPROVAL" | "DENIED" | "LIMITED" | "COMPLETED" | "FAILED" | "STOPPED";

export interface RuntimeStepResult {
  outcome: StepOutcome;
  sessionId: string;
  action?: AgentAction;
  decision?: PolicyDecision;
  result?: ActionResult;
  error?: string;
}

export interface AgentRuntimeOptions {
  policyEngine: PolicyEngine;
  policy: Policy;
  capabilityRegistry?: CapabilityRegistry;
  dispatcher?: ExecutorDispatcher;
  auditLogger?: LocalAuditLogger;
  sessionManager?: SessionManager;
  llmProvider: LLMProvider;
}

export class AgentRuntime {
  private policyEngine: PolicyEngine;
  private policy: Policy;
  private capabilityRegistry: CapabilityRegistry;
  private dispatcher: ExecutorDispatcher;
  private auditLogger: LocalAuditLogger;
  private sessionManager: SessionManager;
  private llmProvider: LLMProvider;

  constructor(options: AgentRuntimeOptions) {
    this.policyEngine = options.policyEngine;
    this.policy = options.policy;
    this.capabilityRegistry = options.capabilityRegistry || new CapabilityRegistry();
    this.dispatcher = options.dispatcher || new ExecutorDispatcher();
    this.auditLogger = options.auditLogger || new LocalAuditLogger();
    this.sessionManager = options.sessionManager || new SessionManager();
    this.llmProvider = options.llmProvider;
  }

  getPolicy(): Policy {
    return this.policy;
  }

  setPolicy(policy: Policy): void {
    this.policy = policy;
  }

  startSession(task: string, agentId = "agent_local"): Session {
    const session = this.sessionManager.createSession(task, agentId);
    this.sessionManager.updateStatus(session.id, "RUNNING");

    this.auditLogger.append({
      event_id: `evt_${crypto.randomUUID()}`,
      session_id: session.id,
      timestamp: new Date().toISOString(),
      stage: "ACTION_PROPOSED",
      action: "session_start",
      result: "success",
      metadata: { task, agentId },
    });

    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  listSessions(): Session[] {
    return this.sessionManager.listSessions();
  }

  emergencyStop(sessionId: string, reason = "User initiated emergency stop"): Session {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    this.sessionManager.setPendingAction(sessionId, undefined);
    this.sessionManager.updateStatus(sessionId, "STOPPED");

    this.auditLogger.append({
      event_id: `evt_${crypto.randomUUID()}`,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      stage: "SESSION_STOPPED",
      action: "emergency_stop",
      reason,
      result: "blocked",
      metadata: { previousStatus: session.status },
    });

    return session;
  }

  async respondToApproval(
    sessionId: string,
    response: "APPROVE" | "DENY" | "CANCEL_SESSION"
  ): Promise<RuntimeStepResult> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    if (session.status === "STOPPED") {
      return { outcome: "STOPPED", sessionId, error: "Cannot approve action: session is stopped" };
    }

    if (session.status !== "WAITING_FOR_APPROVAL" || !session.pendingAction) {
      throw new Error(`Session '${sessionId}' is not waiting for approval`);
    }

    const action = session.pendingAction;
    this.sessionManager.setPendingAction(sessionId, undefined);

    if (response === "CANCEL_SESSION") {
      this.emergencyStop(sessionId, "Session cancelled during approval prompt");
      return { outcome: "STOPPED", sessionId, action };
    }

    if (response === "DENY") {
      this.auditLogger.append({
        event_id: `evt_${crypto.randomUUID()}`,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        stage: "APPROVAL_REJECTED",
        action: action.type,
        target: action.target,
        result: "blocked",
        reason: "User denied explicit approval request",
      });

      this.sessionManager.updateStatus(sessionId, "RUNNING");
      return {
        outcome: "DENIED",
        sessionId,
        action,
        error: "Action denied by user approval response",
      };
    }

    // Response is APPROVE: Execute the action
    this.auditLogger.append({
      event_id: `evt_${crypto.randomUUID()}`,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      stage: "APPROVAL_GRANTED",
      action: action.type,
      target: action.target,
      result: "success",
    });

    const approvedAt = new Date().toISOString();
    const approvedDecision: PolicyDecision = {
      decision: "ALLOW",
      reason: "Explicit user approval granted",
      timestamp: approvedAt,
    };

    const approvedAction: ApprovedAction = {
      action,
      decision: approvedDecision,
      approvalToken: this.dispatcher.generateApprovalToken(action.id || "", "ALLOW", approvedAt),
      approvedAt,
    };

    try {
      const result = await this.dispatcher.dispatch(approvedAction);
      this.sessionManager.addHistory(sessionId, {
        action,
        decision: approvedDecision,
        result,
        timestamp: approvedAt,
      });

      this.auditLogger.append({
        event_id: `evt_${crypto.randomUUID()}`,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        stage: "ACTION_EXECUTED",
        action: action.type,
        target: action.target,
        result: "success",
        execution_result: result as unknown as Record<string, unknown>,
      });

      this.sessionManager.updateStatus(sessionId, "RUNNING");
      return { outcome: "EXECUTED", sessionId, action, decision: approvedDecision, result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.sessionManager.updateStatus(sessionId, "FAILED");
      return { outcome: "FAILED", sessionId, action, error: message };
    }
  }

  async step(sessionId: string): Promise<RuntimeStepResult> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    if (session.status === "STOPPED") {
      return { outcome: "STOPPED", sessionId, error: "Session is stopped" };
    }
    if (session.status === "COMPLETED") {
      return { outcome: "COMPLETED", sessionId };
    }
    if (session.status === "FAILED") {
      return { outcome: "FAILED", sessionId, error: "Session has previously failed" };
    }
    if (session.status === "WAITING_FOR_APPROVAL") {
      return {
        outcome: "WAITING_FOR_APPROVAL",
        sessionId,
        action: session.pendingAction,
        error: "Session is waiting for explicit user approval",
      };
    }

    // 1. Propose action via LLM provider
    const proposed = await this.llmProvider.proposeAction({
      session,
      task: session.task,
      availableCapabilities: this.capabilityRegistry.list(),
      lastResult: session.history[session.history.length - 1]?.result,
    });

    if (!proposed) {
      this.sessionManager.updateStatus(sessionId, "COMPLETED");
      return { outcome: "COMPLETED", sessionId };
    }

    // Normalize action fields
    const action: AgentAction = {
      id: proposed.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId,
      type: proposed.type,
      target: proposed.target || "",
      parameters: proposed.parameters || proposed.payload || {},
      timestamp: proposed.timestamp || new Date().toISOString(),
      agentId: proposed.agentId || session.agentId,
      isSensitive: proposed.isSensitive,
    };

    // Strict validation
    validateAction(action, true);

    this.auditLogger.append({
      event_id: `evt_${crypto.randomUUID()}`,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      stage: "ACTION_PROPOSED",
      action: action.type,
      target: action.target,
      proposed_action: action as unknown as Record<string, unknown>,
    });

    // 2. Validate capability
    try {
      this.capabilityRegistry.assertCapabilitySupported(action.type);
    } catch (capErr: unknown) {
      const msg = capErr instanceof UnknownCapabilityError ? capErr.message : String(capErr);
      this.sessionManager.updateStatus(sessionId, "FAILED");

      this.auditLogger.append({
        event_id: `evt_${crypto.randomUUID()}`,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        stage: "ACTION_FAILED",
        action: action.type,
        target: action.target,
        error: msg,
        result: "failure",
      });

      return { outcome: "FAILED", sessionId, action, error: msg };
    }

    // 3. Emergency stop re-check
    const freshSession = this.sessionManager.getSession(sessionId);
    if (freshSession?.status === "STOPPED") {
      return { outcome: "STOPPED", sessionId, error: "Execution aborted: session stopped" };
    }

    // 4. Policy Engine Evaluation
    const decision = this.policyEngine.evaluate(action, this.policy);

    this.auditLogger.append({
      event_id: `evt_${crypto.randomUUID()}`,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      stage: "POLICY_EVALUATED",
      action: action.type,
      target: action.target,
      policy_decision: decision.decision,
      reason: decision.reason,
    });

    // 5. Enforce Policy Decision
    if (decision.decision === "DENY") {
      this.auditLogger.append({
        event_id: `evt_${crypto.randomUUID()}`,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        stage: "ACTION_DENIED",
        action: action.type,
        target: action.target,
        policy_decision: "DENY",
        reason: decision.reason,
        result: "blocked",
      });

      const blockedResult: ActionResult = {
        actionId: action.id,
        status: "BLOCKED",
        error: decision.reason,
        executedAt: new Date().toISOString(),
      };

      this.sessionManager.addHistory(sessionId, {
        action,
        decision,
        result: blockedResult,
        timestamp: new Date().toISOString(),
      });

      this.sessionManager.updateStatus(sessionId, "FAILED");
      return { outcome: "DENIED", sessionId, action, decision, result: blockedResult };
    }

    if (decision.decision === "LIMITED") {
      this.auditLogger.append({
        event_id: `evt_${crypto.randomUUID()}`,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        stage: "ACTION_DENIED",
        action: action.type,
        target: action.target,
        policy_decision: "LIMITED",
        reason: decision.reason,
        result: "blocked",
      });

      return { outcome: "LIMITED", sessionId, action, decision };
    }

    if (decision.decision === "ASK_USER") {
      this.sessionManager.setPendingAction(sessionId, action);
      this.sessionManager.updateStatus(sessionId, "WAITING_FOR_APPROVAL");

      this.auditLogger.append({
        event_id: `evt_${crypto.randomUUID()}`,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        stage: "APPROVAL_REQUESTED",
        action: action.type,
        target: action.target,
        policy_decision: "ASK_USER",
        reason: decision.reason,
      });

      return { outcome: "WAITING_FOR_APPROVAL", sessionId, action, decision };
    }

    // 6. Action ALLOWED: Execute via Dispatcher
    const approvedAt = new Date().toISOString();
    const approvedAction: ApprovedAction = {
      action,
      decision,
      approvalToken: this.dispatcher.generateApprovalToken(action.id || "", "ALLOW", approvedAt),
      approvedAt,
    };

    this.auditLogger.append({
      event_id: `evt_${crypto.randomUUID()}`,
      session_id: sessionId,
      timestamp: approvedAt,
      stage: "ACTION_ALLOWED",
      action: action.type,
      target: action.target,
      policy_decision: "ALLOW",
    });

    try {
      const result = await this.dispatcher.dispatch(approvedAction);

      this.sessionManager.addHistory(sessionId, {
        action,
        decision,
        result,
        timestamp: approvedAt,
      });

      this.auditLogger.append({
        event_id: `evt_${crypto.randomUUID()}`,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        stage: "ACTION_EXECUTED",
        action: action.type,
        target: action.target,
        result: "success",
        execution_result: result as unknown as Record<string, unknown>,
      });

      return { outcome: "EXECUTED", sessionId, action, decision, result };
    } catch (execErr: unknown) {
      const message = execErr instanceof Error ? execErr.message : String(execErr);
      this.sessionManager.updateStatus(sessionId, "FAILED");

      this.auditLogger.append({
        event_id: `evt_${crypto.randomUUID()}`,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        stage: "ACTION_FAILED",
        action: action.type,
        target: action.target,
        error: message,
        result: "failure",
      });

      return { outcome: "FAILED", sessionId, action, decision, error: message };
    }
  }

  async run(sessionId: string, maxSteps = 10): Promise<Session> {
    for (let step = 0; step < maxSteps; step++) {
      const res = await this.step(sessionId);
      if (
        res.outcome === "COMPLETED" ||
        res.outcome === "FAILED" ||
        res.outcome === "STOPPED" ||
        res.outcome === "WAITING_FOR_APPROVAL" ||
        res.outcome === "DENIED"
      ) {
        break;
      }
    }
    return this.getSession(sessionId)!;
  }
}
