import { AgentAction } from "../types/action.js";
import { Policy, PolicyRule, DecisionType } from "../types/policy.js";

const VALID_DECISIONS: Set<DecisionType> = new Set(["ALLOW", "DENY", "ASK_USER", "LIMITED"]);

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateAction(
  action: unknown,
  requireFullMetadata = false
): asserts action is AgentAction {
  if (!action || typeof action !== "object") {
    throw new ValidationError("Action must be a valid non-null object");
  }
  const act = action as Record<string, unknown>;
  if (typeof act.type !== "string" || act.type.trim() === "") {
    throw new ValidationError("Action must contain a valid non-empty 'type' string");
  }
  if (act.target !== undefined && typeof act.target !== "string") {
    throw new ValidationError("Action 'target', if provided, must be a string");
  }

  if (requireFullMetadata) {
    if (typeof act.id !== "string" || act.id.trim() === "") {
      throw new ValidationError("Action must contain a valid non-empty 'id'");
    }
    if (typeof act.sessionId !== "string" || act.sessionId.trim() === "") {
      throw new ValidationError("Action must contain a valid non-empty 'sessionId'");
    }
    if (typeof act.agentId !== "string" || act.agentId.trim() === "") {
      throw new ValidationError("Action must contain a valid non-empty 'agentId'");
    }
    if (typeof act.target !== "string" || act.target.trim() === "") {
      throw new ValidationError("Action must contain a valid non-empty 'target'");
    }
    if (
      (!act.parameters || typeof act.parameters !== "object") &&
      (!act.payload || typeof act.payload !== "object")
    ) {
      throw new ValidationError("Action must contain a valid 'parameters' object");
    }
    if (typeof act.timestamp !== "string" || act.timestamp.trim() === "") {
      throw new ValidationError("Action must contain a valid non-empty 'timestamp'");
    }
  }
}

export function validatePolicy(policy: unknown): asserts policy is Policy {
  if (!policy || typeof policy !== "object") {
    throw new ValidationError("Policy must be a valid non-null object");
  }
  const pol = policy as Record<string, unknown>;
  if (typeof pol.id !== "string" || pol.id.trim() === "") {
    throw new ValidationError("Policy must contain a valid non-empty 'id'");
  }
  if (typeof pol.name !== "string" || pol.name.trim() === "") {
    throw new ValidationError("Policy must contain a valid non-empty 'name'");
  }
  if (typeof pol.version !== "string" || pol.version.trim() === "") {
    throw new ValidationError("Policy must contain a valid non-empty 'version'");
  }
  if (!Array.isArray(pol.rules)) {
    throw new ValidationError("Policy 'rules' must be an array");
  }

  for (let i = 0; i < pol.rules.length; i++) {
    const rule = pol.rules[i];
    if (!rule || typeof rule !== "object") {
      throw new ValidationError(`Policy rule at index ${i} must be a valid object`);
    }
    const r = rule as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id.trim() === "") {
      throw new ValidationError(`Policy rule at index ${i} must have a valid non-empty 'id'`);
    }
    if (typeof r.actionType !== "string" || r.actionType.trim() === "") {
      throw new ValidationError(
        `Policy rule at index ${i} must have a valid non-empty 'actionType'`
      );
    }
    if (typeof r.decision !== "string" || !VALID_DECISIONS.has(r.decision as DecisionType)) {
      throw new ValidationError(
        `Policy rule at index ${i} has invalid decision '${String(r.decision)}'. Must be ALLOW, DENY, ASK_USER, or LIMITED`
      );
    }
  }
}
