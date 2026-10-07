import * as crypto from "node:crypto";
import { ActionResult } from "../types/action.js";
import { ApprovedAction, IExecutor } from "../types/executor.js";
import { NavigationExecutor } from "./navigation.executor.js";
import { InteractionExecutor } from "./interaction.executor.js";
import { DataTransferExecutor } from "./data-transfer.executor.js";

export class SecurityViolationError extends Error {
  constructor(message: string) {
    super(`[SecurityViolation] ${message}`);
    this.name = "SecurityViolationError";
  }
}

export class ExecutorDispatcher {
  private executors: IExecutor[] = [];
  private tokenSecret: string;

  constructor(tokenSecret?: string, registerDefaults = true) {
    this.tokenSecret = tokenSecret || "openagent_internal_secret_salt_2026";
    if (registerDefaults) {
      this.register(new NavigationExecutor());
      this.register(new InteractionExecutor());
      this.register(new DataTransferExecutor());
    }
  }

  register(executor: IExecutor): void {
    this.executors.push(executor);
  }

  generateApprovalToken(actionId: string, decision: string, approvedAt: string): string {
    const raw = `${actionId}:${decision}:${approvedAt}:${this.tokenSecret}`;
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  verifyApproval(approvedAction: ApprovedAction): boolean {
    if (!approvedAction || typeof approvedAction !== "object") return false;
    if (approvedAction.decision?.decision !== "ALLOW") return false;

    const expected = this.generateApprovalToken(
      approvedAction.action.id || "",
      approvedAction.decision.decision,
      approvedAction.approvedAt
    );
    return crypto.timingSafeEqual(
      Buffer.from(approvedAction.approvalToken, "hex"),
      Buffer.from(expected, "hex")
    );
  }

  async dispatch(approvedAction: ApprovedAction): Promise<ActionResult> {
    // 1. Mandatory verification: Fail closed if not strictly approved
    if (!approvedAction) {
      throw new SecurityViolationError("Null or undefined action passed to executor dispatcher");
    }

    if (!approvedAction.decision || approvedAction.decision.decision !== "ALLOW") {
      throw new SecurityViolationError(
        `Action '${approvedAction.action?.id}' rejected: policy decision is not ALLOW (actual: ${approvedAction.decision?.decision})`
      );
    }

    if (!this.verifyApproval(approvedAction)) {
      throw new SecurityViolationError(
        `Action '${approvedAction.action?.id}' rejected: invalid or forged approval token`
      );
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
