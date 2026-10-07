# Policy Engine Specification

The `PolicyEngine` evaluates an incoming `AgentAction` against a given `Policy` and outputs an unambiguous `PolicyDecision`.

---

## Data Contract

### Input: `AgentAction`

```typescript
interface AgentAction {
  id?: string;
  type: string;
  target?: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
  isSensitive?: boolean;
}
```

### Policy Definition: `Policy`

```typescript
interface Policy {
  id: string;
  name: string;
  version: string;
  defaultDecision?: "ALLOW" | "DENY" | "ASK_USER" | "LIMITED";
  allowedDomains?: string[];
  deniedDomains?: string[];
  sensitiveActionTypes?: string[];
  rules: PolicyRule[];
}
```

### Output: `PolicyDecision`

```typescript
interface PolicyDecision {
  decision: "ALLOW" | "DENY" | "ASK_USER" | "LIMITED";
  reason: string;
  matchedRuleId?: string;
  timestamp: string;
}
```

---

## Evaluation Pipeline Steps

1. **Validation**: Check that `action` and `policy` adhere to valid schemas. Throws `ValidationError` on malformed inputs.
2. **Domain Matching**:
   - If target has a hostname in `deniedDomains`: returns `DENY`.
   - If `allowedDomains` is set and target hostname is missing: returns `DENY`.
3. **Sequential Rule Matching**:
   - Rule `actionType` must match action `type` (or wildcard `*`).
   - Rule `targetPattern` must match action `target` if specified.
   - If rule specifies `rateLimitPerMinute`, verify rolling 60-second window invocation counter. If exceeded, returns `LIMITED`.
   - Returns the rule's `decision` (`ALLOW`, `DENY`, `ASK_USER`, `LIMITED`).
4. **Fallback & Default-Deny**:
   - If no rule matched and the action is classified as sensitive: returns `DENY` (`Default Deny`).
   - Otherwise, returns `policy.defaultDecision` (defaulting to `DENY`).
