# Session Replay Engine Specification

## 1. Overview

The Session Replay Engine reconstructs the execution history of agent sessions directly from audit logs. It operates strictly in `REPLAY_FOR_ANALYSIS` mode: no real executors, browser drivers, network calls, or side effects are triggered during replay.

---

## 2. Replay Architecture

```
Audit Log Stream (JSONL)
        ↓
Audit Store Filter & Chronological Sort
        ↓
SessionReplayEngine (REPLAY_FOR_ANALYSIS)
        ↓
┌────────────────────────────────────────────────────────┐
│ Replay Report:                                         │
│ 1. Metadata (Session ID, Agent ID, Task, Duration)     │
│ 2. Chronological Timeline (Step-by-step outcomes)      │
│ 3. Policy Audit (Rule matches, ALLOW/DENY rationale)   │
│ 4. Security Alerts (HIGH/CRITICAL events & blocks)     │
│ 5. Browser Action Trace (Redacted URLs, selectors)     │
└────────────────────────────────────────────────────────┘
```

---

## 3. Deterministic Guarantees

- **Identical Input Guarantee**: Given the same sequence of audit events, `replaySession()` produces identical reports.
- **Sorting Invariant**: Events are sorted by `sequence_number` ascending (fallback to ISO-8601 millisecond timestamp).
- **Zero Side Effects**: Pure functional reconstruction with no environment mutations.

---

## 4. Privacy & Secret Masking in Replays

- All proposed action parameters and execution results pass through `SecretRedactor` during replay extraction.
- Password fields, authentication tokens, API keys, and sensitive form values are masked as `[REDACTED]`.

---

## 5. Usage & CLI Inspection

Replay a session via CLI:

```bash
# Text summary
openagent session replay <sessionId>

# Verbose payload inspection
openagent session replay <sessionId> --verbose

# JSON export
openagent session replay <sessionId> --format json
```

Or via HTTP API:

```bash
GET /api/v1/sessions/:id/timeline
```
