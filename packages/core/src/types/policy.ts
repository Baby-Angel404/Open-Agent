export type DecisionType = "ALLOW" | "DENY" | "ASK_USER" | "LIMITED";

export interface PolicyRule {
  id: string;
  actionType: string;
  decision: DecisionType;
  targetPattern?: string; // Glob or exact match or regex string
  rateLimitPerMinute?: number;
  description?: string;
}

export interface Policy {
  id: string;
  name: string;
  version: string;
  defaultDecision?: DecisionType;
  allowedDomains?: string[];
  deniedDomains?: string[];
  sensitiveActionTypes?: string[];
  rules: PolicyRule[];
}

export interface PolicyDecision {
  decision: DecisionType;
  reason: string;
  matchedRuleId?: string;
  timestamp: string;
}
