import { AuditLogEntry, SecuritySeverity } from "../types/audit.js";
import { AppendOnlyAuditStore } from "../audit/store.js";
import { SecretRedactor } from "../security/redactor.js";

export type ReplayMode = "REPLAY_FOR_ANALYSIS";

export interface ReplayTimelineStep {
  step: number;
  timestamp: string;
  eventType: string;
  action?: string;
  target?: string;
  policyDecision?: string;
  reason?: string;
  result?: string;
  error?: string;
  securitySeverity?: SecuritySeverity;
  alert?: boolean;
  proposedAction?: Record<string, unknown>;
  executionResult?: Record<string, unknown>;
}

export interface PolicyDecisionAuditItem {
  timestamp: string;
  action: string;
  target?: string;
  decision: string;
  reason?: string;
  severity?: SecuritySeverity;
}

export interface BrowserActionTraceItem {
  timestamp: string;
  actionType: string;
  targetUrlOrSelector: string;
  parameters: Record<string, unknown>;
  resultStatus?: string;
}

export interface SecurityAlertSummaryItem {
  timestamp: string;
  eventId: string;
  severity: SecuritySeverity;
  category: string;
  reason: string;
  action?: string;
}

export interface SessionReplayReport {
  sessionId: string;
  agentId: string;
  mode: ReplayMode;
  reconstructedAt: string;
  initialTask?: string;
  status: "COMPLETED" | "FAILED" | "STOPPED" | "RUNNING" | "UNKNOWN";
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  totalEvents: number;
  totalActionsProposed: number;
  totalActionsExecuted: number;
  totalActionsBlocked: number;
  timeline: ReplayTimelineStep[];
  policyAudit: PolicyDecisionAuditItem[];
  securityAlerts: SecurityAlertSummaryItem[];
  browserActionTrace: BrowserActionTraceItem[];
}

export class SessionReplayEngine {
  private redactor: SecretRedactor;

  constructor() {
    this.redactor = new SecretRedactor();
  }

  /**
   * Deterministically reconstructs a session's execution history from its audit log entries
   * in REPLAY_FOR_ANALYSIS mode (zero side effects).
   */
  replaySession(sessionId: string, entries: AuditLogEntry[]): SessionReplayReport {
    // 1. Filter and sort chronologically
    const sessionEntries = entries
      .filter((e) => e.session_id === sessionId)
      .sort((a, b) => {
        if (a.sequence_number && b.sequence_number) {
          return a.sequence_number - b.sequence_number;
        }
        return Date.parse(a.timestamp) - Date.parse(b.timestamp);
      });

    let agentId = "unknown_agent";
    let initialTask: string | undefined;
    let startedAt: string | undefined;
    let endedAt: string | undefined;
    let status: SessionReplayReport["status"] = "UNKNOWN";

    let actionsProposed = 0;
    let actionsExecuted = 0;
    let actionsBlocked = 0;

    const timeline: ReplayTimelineStep[] = [];
    const policyAudit: PolicyDecisionAuditItem[] = [];
    const securityAlerts: SecurityAlertSummaryItem[] = [];
    const browserActionTrace: BrowserActionTraceItem[] = [];

    let stepCounter = 1;

    for (const entry of sessionEntries) {
      if (!agentId || agentId === "unknown_agent") {
        if (entry.agent_id) agentId = entry.agent_id;
      }

      if (!startedAt) {
        startedAt = entry.timestamp;
      }
      endedAt = entry.timestamp;

      // Extract initial task
      if (entry.event_type === "SESSION_CREATED" || entry.event_type === "TASK_RECEIVED") {
        if (entry.metadata?.task && typeof entry.metadata.task === "string") {
          initialTask = entry.metadata.task;
        }
      } else if (entry.action === "session_start" && entry.metadata?.task) {
        initialTask = String(entry.metadata.task);
      }

      // Track status
      if (entry.event_type === "SESSION_COMPLETED") {
        status = "COMPLETED";
      } else if (entry.event_type === "SESSION_STOPPED" || entry.stage === "SESSION_STOPPED") {
        status = "STOPPED";
      } else if (entry.event_type === "ACTION_FAILED" || entry.result === "failure") {
        status = "FAILED";
      } else if (status === "UNKNOWN") {
        status = "RUNNING";
      }

      // Counters
      if (entry.event_type === "ACTION_PROPOSED" || entry.stage === "ACTION_PROPOSED") {
        if (entry.action !== "session_start") {
          actionsProposed++;
        }
      }
      if (entry.event_type === "ACTION_EXECUTED" || entry.stage === "ACTION_EXECUTED") {
        actionsExecuted++;
      }
      if (
        entry.event_type === "ACTION_BLOCKED" ||
        entry.stage === "ACTION_DENIED" ||
        entry.result === "blocked"
      ) {
        actionsBlocked++;
      }

      // Timeline Step
      const sanitizedProposed = entry.proposed_action
        ? (this.redactor.redactObject(entry.proposed_action) as Record<string, unknown>)
        : undefined;
      const sanitizedExecution = entry.execution_result
        ? (this.redactor.redactObject(entry.execution_result) as Record<string, unknown>)
        : undefined;

      const timelineStep: ReplayTimelineStep = {
        step: stepCounter++,
        timestamp: entry.timestamp,
        eventType: entry.event_type || (entry.stage as string) || "UNKNOWN_EVENT",
        action: entry.action,
        target: entry.target,
        policyDecision: entry.policy_decision,
        reason: entry.reason,
        result: entry.result,
        error: entry.error,
        securitySeverity: entry.security_metadata?.severity,
        alert: entry.security_metadata?.alert,
        proposedAction: sanitizedProposed,
        executionResult: sanitizedExecution,
      };
      timeline.push(timelineStep);

      // Policy decision audit
      if (entry.policy_decision) {
        policyAudit.push({
          timestamp: entry.timestamp,
          action: entry.action || "unknown_action",
          target: entry.target,
          decision: entry.policy_decision,
          reason: entry.reason,
          severity: entry.security_metadata?.severity,
        });
      }

      // Security alerts
      if (
        entry.security_metadata &&
        (entry.security_metadata.severity === "HIGH" ||
          entry.security_metadata.severity === "CRITICAL" ||
          entry.security_metadata.alert)
      ) {
        securityAlerts.push({
          timestamp: entry.timestamp,
          eventId: entry.event_id,
          severity: entry.security_metadata.severity,
          category: entry.security_metadata.category || "SECURITY_ALERT",
          reason:
            entry.security_metadata.classification_reason ||
            entry.reason ||
            "High severity security alert",
          action: entry.action,
        });
      }

      // Browser Action Trace
      const browserActions = [
        "navigate",
        "click",
        "fill",
        "submit",
        "read",
        "evaluate",
        "hover",
        "pressKey",
      ];
      if (
        entry.action &&
        browserActions.includes(entry.action) &&
        (entry.event_type === "ACTION_EXECUTED" ||
          entry.stage === "ACTION_EXECUTED" ||
          entry.event_type === "ACTION_PROPOSED" ||
          entry.stage === "ACTION_PROPOSED")
      ) {
        // Redact parameters thoroughly
        const rawParams = (entry.proposed_action?.parameters ||
          entry.metadata?.parameters ||
          {}) as Record<string, unknown>;
        const safeParams = this.redactor.redactObject(rawParams) as Record<string, unknown>;

        browserActionTrace.push({
          timestamp: entry.timestamp,
          actionType: entry.action,
          targetUrlOrSelector: entry.target || "",
          parameters: safeParams,
          resultStatus: entry.result,
        });
      }
    }

    const durationMs =
      startedAt && endedAt ? Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)) : 0;

    return {
      sessionId,
      agentId,
      mode: "REPLAY_FOR_ANALYSIS",
      reconstructedAt: new Date().toISOString(),
      initialTask,
      status,
      startedAt,
      endedAt,
      durationMs,
      totalEvents: sessionEntries.length,
      totalActionsProposed: actionsProposed,
      totalActionsExecuted: actionsExecuted,
      totalActionsBlocked: actionsBlocked,
      timeline,
      policyAudit,
      securityAlerts,
      browserActionTrace,
    };
  }

  /**
   * Helper to format a replay report as human-readable text.
   */
  static formatReportText(report: SessionReplayReport, verbose = false): string {
    const lines: string[] = [];
    lines.push(`=== Session Replay (Analysis Mode) ===`);
    lines.push(`Session ID:     ${report.sessionId}`);
    lines.push(`Agent ID:       ${report.agentId}`);
    lines.push(`Status:         ${report.status}`);
    lines.push(`Task:           ${report.initialTask || "N/A"}`);
    lines.push(`Started:        ${report.startedAt || "N/A"}`);
    lines.push(`Ended:          ${report.endedAt || "N/A"} (${report.durationMs}ms)`);
    lines.push(`Total Events:   ${report.totalEvents}`);
    lines.push(
      `Actions:        ${report.totalActionsExecuted} executed / ${report.totalActionsBlocked} blocked`
    );

    if (report.securityAlerts.length > 0) {
      lines.push(`\n--- Security Alerts (${report.securityAlerts.length}) ---`);
      for (const alert of report.securityAlerts) {
        lines.push(
          `[${alert.severity}] ${alert.category}: ${alert.reason} (at ${alert.timestamp})`
        );
      }
    }

    lines.push(`\n--- Replay Timeline (${report.timeline.length} steps) ---`);
    for (const step of report.timeline) {
      const decisionStr = step.policyDecision ? ` [Decision: ${step.policyDecision}]` : "";
      const resultStr = step.result ? ` [Result: ${step.result}]` : "";
      const sevStr =
        step.securitySeverity && step.securitySeverity !== "INFO"
          ? ` [${step.securitySeverity}]`
          : "";

      lines.push(
        `Step ${step.step}: [${step.timestamp}] ${step.eventType} -> ${step.action || "none"} (${step.target || ""})${decisionStr}${resultStr}${sevStr}`
      );
      if (step.reason) {
        lines.push(`  Reason: ${step.reason}`);
      }
      if (verbose && step.proposedAction) {
        lines.push(`  Action: ${JSON.stringify(step.proposedAction)}`);
      }
      if (verbose && step.executionResult) {
        lines.push(`  Result: ${JSON.stringify(step.executionResult)}`);
      }
    }

    if (report.browserActionTrace.length > 0) {
      lines.push(
        `\n--- Browser Action Trace (${report.browserActionTrace.length} interactions) ---`
      );
      for (const b of report.browserActionTrace) {
        lines.push(
          `[${b.timestamp}] ${b.actionType} -> ${b.targetUrlOrSelector} (${b.resultStatus || "proposed"})`
        );
      }
    }

    return lines.join("\n");
  }
}
