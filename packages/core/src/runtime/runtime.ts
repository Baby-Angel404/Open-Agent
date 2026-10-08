import * as crypto from "node:crypto";
import { performance } from "node:perf_hooks";
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
import { AppendOnlyAuditStore } from "../audit/store.js";
import { SessionManager } from "../session/manager.js";
import { SecurityClassifier } from "../security/classifier.js";
import { LocalMetricsCollector } from "../observability/metrics.js";
import { AuditEvent, AuditEventType } from "../types/audit.js";

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
  auditLogger?: LocalAuditLogger | AppendOnlyAuditStore;
  sessionManager?: SessionManager;
  llmProvider: LLMProvider;
  metrics?: LocalMetricsCollector;
}

export class AgentRuntime {
  private policyEngine: PolicyEngine;
  private policy: Policy;
  private capabilityRegistry: CapabilityRegistry;
  private dispatcher: ExecutorDispatcher;
  private auditStore: AppendOnlyAuditStore;
  private auditLoggerWrapper: LocalAuditLogger;
  private sessionManager: SessionManager;
  private llmProvider: LLMProvider;
  private metrics: LocalMetricsCollector;

  constructor(options: AgentRuntimeOptions) {
    this.policyEngine = options.policyEngine;
    this.policy = options.policy;
    this.capabilityRegistry = options.capabilityRegistry || new CapabilityRegistry();
    this.dispatcher = options.dispatcher || new ExecutorDispatcher();
    this.sessionManager = options.sessionManager || new SessionManager();
    this.llmProvider = options.llmProvider;
    this.metrics = options.metrics || new LocalMetricsCollector();

    if (options.auditLogger instanceof AppendOnlyAuditStore) {
      this.auditStore = options.auditLogger;
      this.auditLoggerWrapper = new LocalAuditLogger();
    } else if (options.auditLogger instanceof LocalAuditLogger) {
      this.auditLoggerWrapper = options.auditLogger;
      this.auditStore = options.auditLogger.getStore();
    } else {
      this.auditLoggerWrapper = new LocalAuditLogger();
      this.auditStore = this.auditLoggerWrapper.getStore();
    }
  }

  getPolicy(): Policy {
    return this.policy;
  }

  setPolicy(policy: Policy): void {
    this.policy = policy;
  }

  getMetrics(): LocalMetricsCollector {
    return this.metrics;
  }

  getAuditStore(): AppendOnlyAuditStore {
    return this.auditStore;
  }

  getAuditLogger(): LocalAuditLogger {
    return this.auditLoggerWrapper;
  }

  private emitAudit(
    sessionId: string,
    agentId: string,
    eventType: AuditEventType,
    details: Partial<AuditEvent>,
    isSensitiveAction = false
  ): void {
    const secMeta = SecurityClassifier.classify({
      eventType,
      actionType: details.action,
      decision: details.policy_decision,
      error: details.error,
      isSensitiveAction,
    });

    if (secMeta.severity !== "INFO") {
      this.metrics.recordSecurityViolation(
        secMeta.severity,
        secMeta.category || "VIOLATION",
        secMeta.alert
      );
    }

    // Determine backwards-compatible stage
    let stage: any = eventType;
    if (eventType === "ACTION_BLOCKED") stage = "ACTION_DENIED";
    else if (eventType === "USER_DENIED") stage = "APPROVAL_REJECTED";
    else if (eventType === "USER_APPROVED") stage = "APPROVAL_GRANTED";
    else if (eventType === "USER_APPROVAL_REQUESTED") stage = "APPROVAL_REQUESTED";

    const event: AuditEvent = {
      event_id: `evt_${crypto.randomUUID()}`,
      session_id: sessionId,
      agent_id: agentId,
      timestamp: new Date().toISOString(),
      event_type: eventType,
      stage, // Backwards compatibility alias
      action: details.action,
      action_id: details.action_id,
      policy_decision: details.policy_decision,
      reason: details.reason,
      target: details.target,
      target_metadata: details.target ? { resource: details.target } : undefined,
      result: details.result,
      error: details.error,
      security_metadata: secMeta,
      proposed_action: details.proposed_action,
      execution_result: details.execution_result,
      metadata: details.metadata,
    };

    this.auditStore.append(event);
  }

  startSession(task: string, agentId = "agent_local"): Session {
    const session = this.sessionManager.createSession(task, agentId);
    this.sessionManager.updateStatus(session.id, "RUNNING");
    this.metrics.recordSessionEvent("created");

    // Emit SESSION_CREATED
    this.emitAudit(session.id, agentId, "SESSION_CREATED", {
      action: "session_start",
      result: "success",
      metadata: { task, agentId },
    });

    // Emit TASK_RECEIVED
    this.emitAudit(session.id, agentId, "TASK_RECEIVED", {
      action: "receive_task",
      result: "success",
      metadata: { task },
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
    this.metrics.recordSessionEvent("stopped");

    this.emitAudit(sessionId, session.agentId, "SESSION_STOPPED", {
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
      this.metrics.recordActionEvent("denied");
      this.emitAudit(sessionId, session.agentId, "USER_DENIED", {
        action: action.type,
        action_id: action.id,
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

    // Response is APPROVE: Execute the action with bound token and TTL
    this.emitAudit(sessionId, session.agentId, "USER_APPROVED", {
      action: action.type,
      action_id: action.id,
      target: action.target,
      result: "success",
    });

    const approvedAt = new Date().toISOString();
    const approvedDecision: PolicyDecision = {
      decision: "ALLOW",
      reason: "Explicit user approval granted",
      timestamp: approvedAt,
    };

    const approvedAction = this.dispatcher.createApprovedAction(
      action,
      approvedDecision as { decision: "ALLOW"; reason?: string; timestamp?: string },
      approvedAt
    );

    this.metrics.recordActionEvent("allowed");

    try {
      const result = await this.dispatcher.dispatch(approvedAction);
      this.metrics.recordActionEvent("executed");

      this.sessionManager.addHistory(sessionId, {
        action,
        decision: approvedDecision,
        result,
        timestamp: approvedAt,
      });

      this.emitAudit(sessionId, session.agentId, "ACTION_EXECUTED", {
        action: action.type,
        action_id: action.id,
        target: action.target,
        result: "success",
        execution_result: result as unknown as Record<string, unknown>,
      });

      this.sessionManager.updateStatus(sessionId, "RUNNING");
      return { outcome: "EXECUTED", sessionId, action, decision: approvedDecision, result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.metrics.recordActionEvent("failed");
      this.sessionManager.updateStatus(sessionId, "FAILED");

      this.emitAudit(sessionId, session.agentId, "ACTION_FAILED", {
        action: action.type,
        action_id: action.id,
        target: action.target,
        result: "failure",
        error: message,
      });

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
      this.metrics.recordSessionEvent("completed");

      this.emitAudit(sessionId, session.agentId, "SESSION_COMPLETED", {
        action: "session_finish",
        result: "success",
      });

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
    this.metrics.recordActionEvent("proposed");

    this.emitAudit(
      sessionId,
      session.agentId,
      "ACTION_PROPOSED",
      {
        action: action.type,
        action_id: action.id,
        target: action.target,
        proposed_action: action as unknown as Record<string, unknown>,
      },
      action.isSensitive
    );

    // 2. Validate capability
    try {
      this.capabilityRegistry.assertCapabilitySupported(action.type);
    } catch (capErr: unknown) {
      const msg = capErr instanceof UnknownCapabilityError ? capErr.message : String(capErr);
      this.sessionManager.updateStatus(sessionId, "FAILED");
      this.metrics.recordSessionEvent("failed");
      this.metrics.recordActionEvent("failed");

      this.emitAudit(
        sessionId,
        session.agentId,
        "ACTION_FAILED",
        {
          action: action.type,
          action_id: action.id,
          target: action.target,
          error: msg,
          result: "failure",
        },
        action.isSensitive
      );

      return { outcome: "FAILED", sessionId, action, error: msg };
    }

    // 3. Emergency stop re-check
    const freshSession = this.sessionManager.getSession(sessionId);
    if (freshSession?.status === "STOPPED") {
      return { outcome: "STOPPED", sessionId, error: "Execution aborted: session stopped" };
    }

    // 4. Policy Engine Evaluation with latency instrumentation
    const evalStart = performance.now();
    const decision = this.policyEngine.evaluate(action, this.policy);
    const evalDuration = performance.now() - evalStart;
    this.metrics.recordPolicyEvaluation(evalDuration);

    this.emitAudit(
      sessionId,
      session.agentId,
      "POLICY_EVALUATED",
      {
        action: action.type,
        action_id: action.id,
        target: action.target,
        policy_decision: decision.decision,
        reason: decision.reason,
      },
      action.isSensitive
    );

    // 5. Enforce Policy Decision
    if (decision.decision === "DENY") {
      this.metrics.recordActionEvent("denied");
      this.metrics.recordActionEvent("blocked");

      this.emitAudit(
        sessionId,
        session.agentId,
        "ACTION_BLOCKED",
        {
          action: action.type,
          action_id: action.id,
          target: action.target,
          policy_decision: "DENY",
          reason: decision.reason,
          result: "blocked",
        },
        action.isSensitive
      );

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
      this.metrics.recordSessionEvent("failed");
      return { outcome: "DENIED", sessionId, action, decision, result: blockedResult };
    }

    if (decision.decision === "LIMITED") {
      this.metrics.recordActionEvent("denied");
      this.metrics.recordActionEvent("blocked");

      this.emitAudit(
        sessionId,
        session.agentId,
        "ACTION_BLOCKED",
        {
          action: action.type,
          action_id: action.id,
          target: action.target,
          policy_decision: "LIMITED",
          reason: decision.reason,
          result: "blocked",
        },
        action.isSensitive
      );

      return { outcome: "LIMITED", sessionId, action, decision };
    }

    if (decision.decision === "ASK_USER") {
      this.sessionManager.setPendingAction(sessionId, action);
      this.sessionManager.updateStatus(sessionId, "WAITING_FOR_APPROVAL");

      this.emitAudit(
        sessionId,
        session.agentId,
        "USER_APPROVAL_REQUESTED",
        {
          action: action.type,
          action_id: action.id,
          target: action.target,
          policy_decision: "ASK_USER",
          reason: decision.reason,
        },
        action.isSensitive
      );

      return { outcome: "WAITING_FOR_APPROVAL", sessionId, action, decision };
    }

    // 6. Action ALLOWED: Bind action payload and TTL, then dispatch
    const approvedAt = new Date().toISOString();
    const approvedAction = this.dispatcher.createApprovedAction(
      action,
      decision as { decision: "ALLOW"; reason?: string; timestamp?: string },
      approvedAt
    );

    this.metrics.recordActionEvent("allowed");

    this.auditStore.append({
      event_id: `evt_${crypto.randomUUID()}`,
      session_id: sessionId,
      agent_id: session.agentId,
      timestamp: approvedAt,
      event_type: "ACTION_PROPOSED",
      stage: "ACTION_ALLOWED",
      action: action.type,
      target: action.target,
      policy_decision: "ALLOW",
    });

    try {
      const result = await this.dispatcher.dispatch(approvedAction);
      this.metrics.recordActionEvent("executed");

      this.sessionManager.addHistory(sessionId, {
        action,
        decision,
        result,
        timestamp: approvedAt,
      });

      this.emitAudit(
        sessionId,
        session.agentId,
        "ACTION_EXECUTED",
        {
          action: action.type,
          action_id: action.id,
          target: action.target,
          result: "success",
          execution_result: result as unknown as Record<string, unknown>,
        },
        action.isSensitive
      );

      return { outcome: "EXECUTED", sessionId, action, decision, result };
    } catch (execErr: unknown) {
      const message = execErr instanceof Error ? execErr.message : String(execErr);
      this.sessionManager.updateStatus(sessionId, "FAILED");
      this.metrics.recordSessionEvent("failed");
      this.metrics.recordActionEvent("failed");

      this.emitAudit(
        sessionId,
        session.agentId,
        "ACTION_FAILED",
        {
          action: action.type,
          action_id: action.id,
          target: action.target,
          error: message,
          result: "failure",
        },
        action.isSensitive
      );

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
