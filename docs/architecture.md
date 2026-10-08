# OpenAgent Architecture

OpenAgent Infrastructure provides an execution substrate where AI models act solely as **proposers** of actions, while deterministic code gates act as **authorizers** and **enforcers**.

---

## Architectural Principle: Inversion of Trust & Strict Boundaries

In traditional autonomous agent designs, the LLM has direct access to tool APIs or the host environment. If the model hallucinates or is manipulated via prompt injection, unauthorized actions execute immediately.

OpenAgent strictly enforces four trust boundaries:

| Boundary Layer          | Role & Authority                    | Guarantees                                                                                                       |
| :---------------------- | :---------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| **LLM Provider**        | **Untrusted Action Proposer**       | Proposes candidate `AgentAction` payloads. Has zero authority to bypass policies or execute code directly.       |
| **Policy Engine**       | **Security Authority**              | Deterministic rule and domain gatekeeper. Makes irrevocable `ALLOW`, `DENY`, `ASK_USER`, or `LIMITED` decisions. |
| **Executor Dispatcher** | **Controlled Capability Execution** | Modular execution units. Rejects any action without an authenticated, un-tampered `ApprovedAction` token.        |
| **Audit Logger**        | **Accountability Layer**            | Append-only SHA-256 hash-chained log. Sanitizes secrets and preserves permanent audit evidence locally.          |

```
+---------------+
|     USER      |
+-------+-------+
        │ (Task / Goal)
        ▼
+---------------+
| AGENT RUNTIME |
+-------+-------+
        │
        ▼
+---------------+
|  LLM PROVIDER |  <--- UNTRUSTED PROPOSER
+-------+-------+
        │ (Proposed AgentAction)
        ▼
+---------------+
| POLICY ENGINE |  <--- SECURITY AUTHORITY
+-------+-------+
        │
   +----+----+-------------------------+
   │         │                         │
 ALLOW    ASK_USER                   DENY
   │         │                         │
   │    +----+----+                    ▼
   │    │ USER    │                 BLOCKED
   │    │ APPROVAL│                    │
   │    +----+----+                    │
   │         │                         │
   │   [Approve] [Deny]                │
   │      │        │                   │
   ▼      ▼        ▼                   │
+---------------+  ABORT               │
|  DISPATCHER   |                      │
+-------+-------+                      │
        │ (ApprovedAction Token)       │
        ▼                              ▼
+---------------+              +---------------+
|   EXECUTOR    |              |  AUDIT LOG    |
+-------+-------+              |  (REDACTED)   |
        │ (ActionResult)       +---------------+
        └──────────────────────────────▲
```

---

## Agent Runtime Lifecycle & Subsystems

1. **Session Management**:
   Every user task instantiates a managed `Session` tracked through explicit states:
   - `CREATED` -> `RUNNING` -> `WAITING_FOR_APPROVAL` -> `COMPLETED` / `FAILED` / `STOPPED`.
2. **Action Proposal & Validation**:
   The `LLMProvider` generates a candidate `AgentAction`. The runtime validates all metadata (`id`, `sessionId`, `type`, `target`, `parameters`, `timestamp`, `agentId`) and verifies that the action maps to a registered capability in `CapabilityRegistry`.
3. **Policy Evaluation**:
   `PolicyEngine.evaluate(action, policy)` verifies domains, inherently sensitive action lists, and rate limits.
4. **Approval Loop (`ASK_USER`)**:
   If the policy requires confirmation, the runtime suspends the session (`WAITING_FOR_APPROVAL`). Execution resumes only upon receiving explicit user input (`APPROVE`, `DENY`, or `CANCEL_SESSION`).
5. **Emergency Stop (Kill Switch)**:
   The user or operator can call `emergencyStop()` at any point. Active and pending actions are aborted immediately, session transitions to `STOPPED`, and an immutable audit event is persisted.
6. **Local API & Security Dashboard**:
   A versioned HTTP API (`/api/v1/agents`, `/api/v1/sessions`, `/api/v1/policies`, `/api/v1/audit`, `/api/v1/metrics`, `/api/v1/sessions/:id/timeline`) bound exclusively to `127.0.0.1` serves both the CLI and local web dashboard.
7. **Append-Only Store & Cryptographic Hash Chaining**:
   Sequential SHA-256 hash chaining over canonical JSON representations of sanitized events. Supports free-text query, filtering, independent integrity verification, and standalone export bundles.
8. **Action Binding & Expiration**:
   Cryptographic tokens bind the exact action payload hash (`actionDigest`), decision, approval timestamp, and TTL (`expiresAt`, default 10 seconds). The dispatcher verifies unexpired tokens and single-use consumption to prevent payload tampering and replay attacks.
9. **Deterministic Session Replay**:
   The `SessionReplayEngine` reconstructs chronological step timelines, policy decisions, security alerts, and sanitized browser traces in `REPLAY_FOR_ANALYSIS` mode with zero side effects.
10. **Local Observability**:
    Real-time in-memory tracking of session states, action throughput, evaluation latencies (p50, p95, p99), and security violation classifications with zero cloud telemetry.
