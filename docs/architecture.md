# OpenAgent Architecture

OpenAgent Infrastructure provides an execution substrate where AI models act solely as **proposers** of actions, while deterministic code gates act as **authorizers** and **enforcers**.

---

## Architectural Principle: Inversion of Trust

In traditional autonomous agent designs, the LLM is given direct access to tool APIs or the shell. If the model hallucinates or is manipulated via prompt injection, malicious actions execute directly.

OpenAgent implements an **Inversion of Trust**:

```
+---------------+
|     USER      |
+-------+-------+
        │ (Goal / Prompt)
        ▼
+---------------+
|  AI PLANNER   |  <--- UNTRUSTED / STOCHASTIC LAYER
+-------+-------+
        │ (Proposed Action Payload)
        ▼
+---------------+
| POLICY ENGINE |  <--- TRUSTED DETERMINISTIC GATE
+-------+-------+
        │
   +----+----+---------------+
   │         │               │
 ALLOW    ASK_USER         DENY
   │         │               │
   ▼         ▼               ▼
EXECUTOR  CONFIRMATION    ABORT
   │
   ▼
+---------------------+
| APPEND-ONLY AUDIT   |
+---------------------+
```

---

## Subsystem Interactions

1. **Agent Planning**: The agent produces a structured `AgentAction` with a `type`, optional `target`, and `payload`.
2. **Policy Evaluation**: The `PolicyEngine` evaluates the action against active `Policy` rules.
3. **Execution Decision**:
   - `ALLOW`: The action proceeds immediately to the designated executor.
   - `DENY`: The action is blocked, reason is recorded, and execution halts or requests replanning.
   - `ASK_USER`: The action is suspended until explicit confirmation is obtained.
   - `LIMITED`: The action is throttled due to exceeding configured rate limits.
4. **Audit Logging**: Every evaluation and execution result emits an immutable `AuditEvent`, chained using SHA-256 hashes in a local append-only log.

---

## Modularity & Extensibility

- `@open-agent/core`: Zero-dependency library usable across CLI, Node.js daemons, and browser environments.
- `@open-agent/cli`: Thin operator wrapper providing human inspection and diagnostics.
- `crates/*`: Reserved for high-performance Rust native extensions (future phases).
- `services/*`: Reserved for localized background coordination daemons (future phases).
