import { SecurityMetadata, SecuritySeverity, AuditEventType } from "../types/audit.js";
import { DecisionType } from "../types/policy.js";

export interface ClassificationContext {
  eventType: AuditEventType;
  actionType?: string;
  decision?: DecisionType;
  error?: string;
  isSensitiveAction?: boolean;
  tamperDetected?: boolean;
  indicators?: string[];
}

export class SecurityClassifier {
  /**
   * Deterministically classifies an event into a documented security severity level.
   */
  static classify(ctx: ClassificationContext): SecurityMetadata {
    // 1. CRITICAL: Tampering, cryptographic invalidation, or active privilege escalation
    if (ctx.tamperDetected) {
      return {
        severity: "CRITICAL",
        category: "INTEGRITY_TAMPERING",
        alert: true,
        classification_reason: "Cryptographic hash chain or approval token tampering detected",
      };
    }

    if (
      ctx.error?.includes("[SecurityViolation]") ||
      ctx.error?.includes("forged approval token")
    ) {
      return {
        severity: "CRITICAL",
        category: "SECURITY_VIOLATION",
        alert: true,
        classification_reason: "Direct executor invocation or forged approval token attempt",
      };
    }

    // 2. HIGH: Blocked inherently sensitive action, prompt injection, or forced emergency stop
    if (ctx.indicators?.includes("PROMPT_INJECTION")) {
      return {
        severity: "HIGH",
        category: "PROMPT_INJECTION",
        alert: true,
        classification_reason: "Pattern consistent with prompt injection or jailbreak detected",
      };
    }

    if (ctx.eventType === "ACTION_BLOCKED" && ctx.isSensitiveAction) {
      return {
        severity: "HIGH",
        category: "SENSITIVE_ACTION_BLOCKED",
        alert: true,
        classification_reason: `Blocked sensitive action '${ctx.actionType}' lacking explicit permission`,
      };
    }

    if (ctx.eventType === "SESSION_STOPPED") {
      return {
        severity: "HIGH",
        category: "OPERATOR_KILL_SWITCH",
        alert: true,
        classification_reason: "Emergency stop invoked by user or automated safety circuit",
      };
    }

    // 3. MEDIUM: Rate limiting, unknown capability, domain restriction breach
    if (ctx.decision === "LIMITED") {
      return {
        severity: "MEDIUM",
        category: "RATE_LIMIT_EXCEEDED",
        alert: false,
        classification_reason: "Action execution throttled by rolling rate limit rule",
      };
    }

    if (ctx.error?.includes("not registered in capability registry")) {
      return {
        severity: "MEDIUM",
        category: "UNKNOWN_CAPABILITY",
        alert: false,
        classification_reason: "Agent requested an unregistered capability",
      };
    }

    if (ctx.eventType === "ACTION_BLOCKED" && !ctx.isSensitiveAction) {
      return {
        severity: "MEDIUM",
        category: "POLICY_RESTRICTION",
        alert: false,
        classification_reason: "Action blocked by policy domain or wildcard pattern restriction",
      };
    }

    // 4. LOW: Explicit user denial, benign validation error, task failure
    if (ctx.eventType === "USER_DENIED") {
      return {
        severity: "LOW",
        category: "USER_REJECTION",
        alert: false,
        classification_reason: "User explicitly declined confirmation during ASK_USER prompt",
      };
    }

    if (ctx.eventType === "ACTION_FAILED" || ctx.error) {
      return {
        severity: "LOW",
        category: "EXECUTION_FAILURE",
        alert: false,
        classification_reason: ctx.error || "Action execution resulted in failure",
      };
    }

    // 5. INFO: Standard operational lifecycle events
    return {
      severity: "INFO",
      category: "OPERATIONAL",
      alert: false,
      classification_reason: "Standard operational lifecycle event",
    };
  }
}
