import { AgentAction } from "../types/action.js";
import { Policy, PolicyDecision, DecisionType } from "../types/policy.js";
import { validateAction, validatePolicy } from "./validator.js";

export interface RateLimitTracker {
  timestamps: number[];
}

export class PolicyEngine {
  private rateLimits: Map<string, RateLimitTracker> = new Map();

  // Known inherently sensitive action types that require explicit rule permission
  private static readonly INHERENTLY_SENSITIVE_ACTIONS: Set<string> = new Set([
    "execute_code",
    "file_write",
    "file_delete",
    "shell_exec",
    "download_file",
    "read_credentials",
    "input_password",
    "submit_payment",
    "network_exfiltrate",
    "remote_execution",
    "sensitive_data_transfer",
  ]);

  /**
   * Deterministically evaluates an action against a policy.
   * Follows strict DEFAULT-DENY principle.
   */
  evaluate(action: AgentAction, policy: Policy): PolicyDecision {
    const timestamp = new Date().toISOString();

    // 1. Strict schema validation
    validateAction(action);
    validatePolicy(policy);

    const isSensitive =
      action.isSensitive === true ||
      PolicyEngine.INHERENTLY_SENSITIVE_ACTIONS.has(action.type.toLowerCase()) ||
      (policy.sensitiveActionTypes?.includes(action.type) ?? false);

    // 2. Domain verification if target is a web address or hostname
    const targetDomain = this.extractDomain(action.target);
    if (targetDomain) {
      if (
        policy.deniedDomains &&
        policy.deniedDomains.some((d) => this.matchesDomain(targetDomain, d))
      ) {
        return {
          decision: "DENY",
          reason: `Target domain '${targetDomain}' is explicitly in policy deniedDomains`,
          timestamp,
        };
      }

      if (policy.allowedDomains && policy.allowedDomains.length > 0) {
        if (!policy.allowedDomains.some((d) => this.matchesDomain(targetDomain, d))) {
          return {
            decision: "DENY",
            reason: `Target domain '${targetDomain}' is not present in policy allowedDomains`,
            timestamp,
          };
        }
      }
    }

    // 3. Rule matching: Evaluate rules in deterministic order
    for (const rule of policy.rules) {
      if (rule.actionType !== "*" && rule.actionType !== action.type) {
        continue;
      }

      // Check targetPattern if defined
      if (rule.targetPattern && action.target) {
        if (!this.matchesPattern(action.target, rule.targetPattern)) {
          continue;
        }
      }

      // Check rate limit if defined
      if (rule.rateLimitPerMinute !== undefined && rule.rateLimitPerMinute > 0) {
        const isLimited = this.checkRateLimit(rule.id, rule.rateLimitPerMinute);
        if (isLimited) {
          return {
            decision: "LIMITED",
            reason: `Rate limit of ${rule.rateLimitPerMinute} calls/minute exceeded for rule '${rule.id}'`,
            matchedRuleId: rule.id,
            timestamp,
          };
        }
      }

      return {
        decision: rule.decision,
        reason: rule.description || `Matched rule '${rule.id}' with decision ${rule.decision}`,
        matchedRuleId: rule.id,
        timestamp,
      };
    }

    // 4. Default behavior when no specific rule matched
    if (isSensitive) {
      return {
        decision: "DENY",
        reason: `Default Deny: Sensitive action '${action.type}' has no explicit permission rule in policy '${policy.id}'`,
        timestamp,
      };
    }

    const fallback: DecisionType = policy.defaultDecision || "DENY";
    return {
      decision: fallback,
      reason: `Default ${fallback}: No matching rule found for action '${action.type}' in policy '${policy.id}'`,
      timestamp,
    };
  }

  private extractDomain(target?: string): string | null {
    if (!target) return null;
    try {
      if (target.startsWith("http://") || target.startsWith("https://")) {
        const u = new URL(target);
        return u.hostname.toLowerCase();
      }
      // Support direct hostname target (e.g. "api.example.com" or "localhost")
      if (
        !target.includes("/") &&
        !target.includes(" ") &&
        (target.includes(".") || target === "localhost")
      ) {
        return target.split(":")[0].toLowerCase();
      }
      return null;
    } catch {
      return null;
    }
  }

  private matchesDomain(domain: string, pattern: string): boolean {
    const p = pattern.toLowerCase();
    const d = domain.toLowerCase();
    if (p === "*" || p === d) return true;
    if (p.startsWith("*.")) {
      const suffix = p.slice(2);
      return d === suffix || d.endsWith("." + suffix);
    }
    return false;
  }

  private matchesPattern(target: string, pattern: string): boolean {
    if (pattern === "*" || pattern === target) return true;

    // Wildcard domain matching: *.example.com must match sub.example.com or example.com, but NEVER evilexample.com
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2).toLowerCase();
      const domain = this.extractDomain(target) || target.toLowerCase();
      return domain === suffix || domain.endsWith("." + suffix);
    }

    if (pattern.endsWith(":*")) {
      const prefix = pattern.slice(0, -2);
      return target.startsWith(prefix + ":") || target === prefix;
    }

    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      return target.startsWith(prefix);
    }

    return false;
  }

  private checkRateLimit(ruleId: string, limit: number): boolean {
    const now = Date.now();
    const tracker = this.rateLimits.get(ruleId) || { timestamps: [] };
    // Filter timestamps within the last 60 seconds
    tracker.timestamps = tracker.timestamps.filter((ts) => now - ts < 60000);

    if (tracker.timestamps.length >= limit) {
      return true;
    }

    tracker.timestamps.push(now);
    this.rateLimits.set(ruleId, tracker);
    return false;
  }

  resetRateLimits(): void {
    this.rateLimits.clear();
  }
}
