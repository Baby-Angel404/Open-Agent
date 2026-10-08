import * as crypto from "node:crypto";
import { AgentAction, ActionResult } from "../types/action.js";
import { PolicyDecision } from "../types/policy.js";
import { ApprovedAction, IExecutor } from "../types/executor.js";
import { NavigationExecutor } from "./navigation.executor.js";
import { InteractionExecutor } from "./interaction.executor.js";
import { DataTransferExecutor } from "./data-transfer.executor.js";
import { canonicalJson } from "../audit/store.js";

export class SecurityViolationError extends Error {
  constructor(message: string) {
    super(`[SecurityViolation] ${message}`);
    this.name = "SecurityViolationError";
  }
}

export class ExecutorDispatcher {
  private executors: IExecutor[] = [];
  private tokenSecret: string;
  private defaultTtlMs: number;
  private consumedTokens: Set<string> = new Set();

  constructor(tokenSecret?: string, registerDefaults = true, defaultTtlMs = 10000) {
    this.tokenSecret = tokenSecret || "openagent_internal_secret_salt_2026";
    this.defaultTtlMs = defaultTtlMs;
    if (registerDefaults) {
      this.register(new NavigationExecutor());
      this.register(new InteractionExecutor());
      this.register(new DataTransferExecutor());
    }
  }

  register(executor: IExecutor): void {
    this.executors.push(executor);
  }

  getDefaultTtlMs(): number {
    return this.defaultTtlMs;
  }

  /**
   * Deterministically computes the SHA-256 digest of an action's canonical payload.
   */
  computeActionDigest(action: AgentAction): string {
    const canonicalPayload = {
      id: action.id,
      sessionId: action.sessionId,
      type: action.type,
      target: action.target || "",
      parameters: action.parameters || {},
      agentId: action.agentId || "",
      isSensitive: Boolean(action.isSensitive),
    };
    const raw = canonicalJson(canonicalPayload);
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  /**
   * Generates a tamper-evident cryptographic approval token binding the action, decision, and TTL.
   */
  generateApprovalToken(
    actionId: string,
    decision: string,
    approvedAt: string,
    actionDigest?: string,
    expiresAt?: string
  ): string {
    const digest = actionDigest || "legacy_digest";
    const expiry = expiresAt || approvedAt;
    const raw = `${actionId}:${digest}:${decision}:${approvedAt}:${expiry}:${this.tokenSecret}`;
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  /**
   * Creates a fully bound ApprovedAction object with cryptographic digest, expiration TTL, and token.
   */
  createApprovedAction(
    action: AgentAction,
    decision: PolicyDecision | (Partial<PolicyDecision> & { decision: "ALLOW" }),
    approvedAt = new Date().toISOString(),
    ttlMs = this.defaultTtlMs
  ): ApprovedAction {
    if (decision.decision !== "ALLOW") {
      throw new SecurityViolationError(
        `Cannot create approved action: policy decision is not ALLOW (actual: ${decision.decision})`
      );
    }
    const fullDecision: PolicyDecision = {
      decision: "ALLOW",
      reason: decision.reason || "Explicit policy ALLOW decision",
      timestamp: decision.timestamp || approvedAt,
    };
    const actionDigest = this.computeActionDigest(action);
    const expiresAt = new Date(Date.parse(approvedAt) + ttlMs).toISOString();
    const approvalToken = this.generateApprovalToken(
      action.id || "",
      fullDecision.decision,
      approvedAt,
      actionDigest,
      expiresAt
    );

    return {
      action,
      decision: fullDecision,
      approvalToken,
      approvedAt,
      actionDigest,
      expiresAt,
    };
  }

  verifyApproval(approvedAction: ApprovedAction, currentTimeMs = Date.now()): boolean {
    if (!approvedAction || typeof approvedAction !== "object") return false;
    if (approvedAction.decision?.decision !== "ALLOW") return false;

    // Check expiration TTL
    if (approvedAction.expiresAt) {
      const expiryMs = Date.parse(approvedAction.expiresAt);
      if (currentTimeMs > expiryMs) {
        return false;
      }
    }

    // Check payload mutation
    if (approvedAction.actionDigest) {
      const expectedDigest = this.computeActionDigest(approvedAction.action);
      if (approvedAction.actionDigest !== expectedDigest) {
        return false;
      }
    }

    // Check replay attack: token cannot be reused
    if (this.consumedTokens.has(approvedAction.approvalToken)) {
      return false;
    }

    // Verify token cryptographic signature
    const expected = this.generateApprovalToken(
      approvedAction.action.id || "",
      approvedAction.decision.decision,
      approvedAction.approvedAt,
      approvedAction.actionDigest,
      approvedAction.expiresAt
    );

    const tokenBuf = Buffer.from(approvedAction.approvalToken, "hex");
    const expectedBuf = Buffer.from(expected, "hex");

    if (tokenBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(tokenBuf, expectedBuf);
  }

  async dispatch(
    approvedAction: ApprovedAction,
    currentTimeMs = Date.now()
  ): Promise<ActionResult> {
    // 1. Mandatory verification: Fail closed if not strictly approved
    if (!approvedAction) {
      throw new SecurityViolationError("Null or undefined action passed to executor dispatcher");
    }

    if (!approvedAction.decision || approvedAction.decision.decision !== "ALLOW") {
      throw new SecurityViolationError(
        `Action '${approvedAction.action?.id}' rejected: policy decision is not ALLOW (actual: ${approvedAction.decision?.decision})`
      );
    }

    // Check expiration explicitly for descriptive security error
    if (approvedAction.expiresAt) {
      const expiryMs = Date.parse(approvedAction.expiresAt);
      if (currentTimeMs > expiryMs) {
        throw new SecurityViolationError(
          `Action '${approvedAction.action?.id}' rejected: approval token expired at ${approvedAction.expiresAt}`
        );
      }
    }

    // Check payload mutation explicitly for descriptive security error
    if (approvedAction.actionDigest) {
      const expectedDigest = this.computeActionDigest(approvedAction.action);
      if (approvedAction.actionDigest !== expectedDigest) {
        throw new SecurityViolationError(
          `Action '${approvedAction.action?.id}' rejected: action payload digest mismatch (payload mutated post-approval)`
        );
      }
    }

    // Check replay attack explicitly
    if (this.consumedTokens.has(approvedAction.approvalToken)) {
      throw new SecurityViolationError(
        `Action '${approvedAction.action?.id}' rejected: approval token already consumed (replay attack prevented)`
      );
    }

    if (!this.verifyApproval(approvedAction, currentTimeMs)) {
      throw new SecurityViolationError(
        `Action '${approvedAction.action?.id}' rejected: invalid or forged approval token`
      );
    }

    // Mark token consumed to prevent replay attack
    this.consumedTokens.add(approvedAction.approvalToken);
    if (this.consumedTokens.size > 10000) {
      // Prune oldest tokens to limit memory
      const it = this.consumedTokens.values();
      for (let i = 0; i < 2000; i++) {
        const val = it.next().value;
        if (val) this.consumedTokens.delete(val);
      }
    }

    // 2. Find matching executor
    for (const executor of this.executors) {
      if (executor.canHandle(approvedAction)) {
        return await executor.execute(approvedAction);
      }
    }

    throw new SecurityViolationError(
      `No registered executor capable of handling action type '${approvedAction.action.type}'`
    );
  }
}
