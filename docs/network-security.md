# Network Security Architecture & Policy Enforcement

Networking in OpenAgent Infrastructure operates under a zero-trust model where all network traffic must cross the local Policy Engine boundary.

## Policy Engine Gatekeeper

Both incoming requests from peers and outgoing requests from the local agent must be evaluated by `PolicyEngine.evaluate(action, policy)`:

1. **Outgoing Invocation**:
   - Evaluated as `actionType: "CAPABILITY_INVOCATION"` with target: `peer_id:capability_id`.
   - Data transfer evaluated as `actionType: "DATA_TRANSFER"` with parameter classification.
2. **Inherently Sensitive Actions**:
   - `remote_execution` and `sensitive_data_transfer` are flagged as sensitive in the core policy engine and denied by default.
   - Any remote execution proposal without explicit approval rules is blocked.

## Data Classification & Secret Exfiltration Prevention

Payloads are classified into four tiers:

- `PUBLIC`: General retrieval parameters, search keywords.
- `INTERNAL`: Internal document IDs, chunk references.
- `SENSITIVE`: Personally Identifiable Information (PII), confidential metadata.
- `SECRET`: Cryptographic keys, API tokens, authorization credentials.

### Sanitization & Leak Detection

The invocation pipeline inspects outgoing parameters for accidental credential leakage using regex patterns (`API_KEY`, `BEARER_TOKEN`, `PRIVATE_KEY`). Detected secrets trigger immediate policy blocking and high-severity audit events.

## Resource & Rate Limits

The `ResourceGuard` enforces strict operational limits:

- Max request payload size: 2 MB
- Max response payload size: 5 MB
- Max execution duration: 30,000 ms
- Max concurrent active requests: 10
- Max requests per peer per minute: 60
- Max requests per capability per minute: 120

## Source Reference

- Invocation Handler: [`packages/network/src/invocation/invocation-handler.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/invocation/invocation-handler.ts)
- Resource Guard: [`packages/network/src/guards/resource-guard.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/guards/resource-guard.ts)
- Policy Engine: [`packages/core/src/policy/engine.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/core/src/policy/engine.ts)
