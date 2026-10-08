# OpenAgent Threat Model (Phase 3)

## 1. Scope & Security Objectives

OpenAgent Infrastructure executes autonomous AI agent actions locally with strict default-deny policy enforcement. This document defines the threat vectors addressed in Phase 3.

---

## 2. Threat Analysis & Mitigations

### 2.1 Post-Approval Action Payload Tampering

- **Threat**: An adversary or compromised planner mutates action parameters (e.g., switches target URL or adds data exfiltration flags) between policy evaluation and executor dispatch.
- **Mitigation**: Cryptographic action binding (`actionDigest`). The dispatcher calculates `SHA-256(canonicalJson(action))` and binds it to the approval token. If the payload is modified after approval, dispatch fails closed with `SecurityViolationError`.

### 2.2 Replay Attacks & Approval Re-Use

- **Threat**: An approval token generated for one action is captured and submitted multiple times to re-execute sensitive actions without re-evaluation.
- **Mitigation**: Single-use token enforcement. The dispatcher tracks consumed approval tokens in an in-memory set. Any reuse immediately triggers a security violation.

### 2.3 Stale Approval Window (Time-of-Check to Time-of-Use)

- **Threat**: An action approved during a valid window is delayed and executed much later when security contexts or system states have changed.
- **Mitigation**: Strict Time-To-Live (`expiresAt`, default 10 seconds). Expired tokens fail closed.

### 2.4 Audit Log Tampering, Deletion, and Truncation

- **Threat**: An attacker modifies historical audit records to hide unauthorized activities or deletes offending entries.
- **Mitigation**: SHA-256 hash chaining over canonical event serializations. Any retroactive insertion, deletion, modification, or truncation invalidates subsequent hashes and pinpoints the exact corrupted index.
- **Boundary Limitation**: Hash chaining detects tampering, but cannot prevent an adversary with full OS filesystem write access from recalculating the entire file hash chain from a new root. Out-of-band export or write-protected media is required for hostile host defenses.

### 2.5 Secret & Credential Leakage

- **Threat**: Sensitive user passwords, API keys, and session cookies leak into audit logs, replays, or dashboard views.
- **Mitigation**: Structured and pattern-based secret redaction in `SecretRedactor` covering password form types, Bearer tokens, API key query parameters, and sensitive dictionary keys prior to writing logs.

### 2.6 Local API Boundary Exposure

- **Threat**: External web applications execute cross-origin requests to control the local agent runtime via `http://localhost`.
- **Mitigation**:
  - Binding exclusively to loopback interface `127.0.0.1` (never `0.0.0.0`).
  - Strict Origin header verification: reject all non-loopback origins with HTTP 403 Forbidden.
  - Per-IP local rate limiting to prevent denial of service and event flood loops.
