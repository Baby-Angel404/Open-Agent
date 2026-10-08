# Audit Subsystem Specification

## 1. Overview

The OpenAgent Infrastructure Audit Subsystem provides an append-only, tamper-evident cryptographic event stream. Every operation executed by autonomous agents, policy evaluators, and human operators is recorded sequentially in local JSON Lines (`.jsonl`) files.

---

## 2. Event Types & Lifecycle

The stream supports 12 first-class event types:

| Event Type                | Description                                                          |
| :------------------------ | :------------------------------------------------------------------- |
| `SESSION_CREATED`         | New execution session initialized with task definition               |
| `TASK_RECEIVED`           | Agent receives user task or sub-goal                                 |
| `ACTION_PROPOSED`         | LLM or planner proposes an action candidate                          |
| `POLICY_EVALUATED`        | Policy engine evaluates proposed action against active policy        |
| `USER_APPROVAL_REQUESTED` | Action triggered an `ASK_USER` rule and is waiting on confirmation   |
| `USER_APPROVED`           | Operator granted permission for pending action                       |
| `USER_DENIED`             | Operator rejected pending action                                     |
| `ACTION_EXECUTED`         | Dispatcher and executor completed the action successfully            |
| `ACTION_FAILED`           | Action execution encountered a runtime failure                       |
| `ACTION_BLOCKED`          | Policy engine or dispatcher rejected execution (`DENY` or `LIMITED`) |
| `SESSION_STOPPED`         | Emergency stop / kill switch activated                               |
| `SESSION_COMPLETED`       | Session finished cleanly                                             |

---

## 3. Cryptographic Hash Chain Design

Each log entry is bound to its predecessor via SHA-256 chaining:

```
Genesis Hash:
prev_hash_0 = 0000000000000000000000000000000000000000000000000000000000000000

Entry N Hash:
hash_N = SHA-256( prev_hash_N + ":" + CanonicalJSON(sanitizedEventPayload) )
```

- **Canonical Serialization**: Object keys are sorted alphabetically before serialization to guarantee cross-runtime reproducibility.
- **Excluded Fields**: Internal hash linkage fields (`hash`, `prev_hash`, `sequence_number`) are stripped prior to hashing.
- **Secret Redaction**: Passwords, API keys, bearer tokens, and session cookies are redacted before hash computation and file write.

---

## 4. Integrity Verification & Tamper Detection

The `verifyIntegrity()` engine traverses the chain sequentially and validates:

1. **Sequence Continuity**: `sequence_number` strictly increments by 1.
2. **Linkage Continuity**: `entry[i].prev_hash === entry[i-1].hash`.
3. **Digest Verification**: Recalculated SHA-256 matches `entry[i].hash`.

Upon detecting tampering, deletion, or truncation, verification fails closed and pinpoints:

- Broken entry index
- Offending `event_id`
- Exact corruption reason (expected hash vs actual hash)

---

## 5. Export Mechanism

Sessions can be exported into standalone verifiable bundles:

```json
{
  "version": "1.0.0",
  "exportedAt": "2026-10-08T00:10:00.000Z",
  "sessionId": "session_1791418213217_bugh8d",
  "entries": [ ... ],
  "rootHash": "fc59fd7f77cc3578f36288db63776157abec6814973c8e64603f56485b7cd5da",
  "leafHash": "c30d61e59126e8781677c333a7ba884b5ae48637be3789bc9ee0943db7da9da8",
  "integrityValid": true
}
```

Bundles can be verified independently using `AppendOnlyAuditStore.verifyBundle(bundle)`.

---

## 6. Retention & Rotation Policy

- Configurable `maxFileSizeBytes` and `maxAgeDays`.
- When rotation triggers, active file is renamed to `audit-events.<timestamp>.archive.jsonl`.
- The new active file starts cleanly while preserving the last chain hash as genesis anchor.
