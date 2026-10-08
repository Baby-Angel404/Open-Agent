# Deterministic Reputation System

The OpenAgent reputation system is completely mathematical, evidence-backed, and deterministic. It eliminates subjective, hallucinated, or opaque AI assessments by computing scores strictly from verifiable interaction events.

## Mathematical Formulation

Every agent begins with a neutral score of **50.0** (clamped to `[0.0, 100.0]`).

```
Score(t) = clamp(Score(t-1) + Σ Delta(e), 0.0, 100.0)
```

### Event Deltas

| Event Type           | Score Delta | Description                                             |
| :------------------- | :---------- | :------------------------------------------------------ |
| `SUCCESSFUL_REQUEST` | **+2.0**    | Capability executed cleanly within SLA and verified     |
| `FAILED_REQUEST`     | **-5.0**    | Capability execution returned error or execution failed |
| `TIMEOUT`            | **-8.0**    | Peer did not respond within configured timeout window   |
| `INVALID_SIGNATURE`  | **-20.0**   | Cryptographic verification failed on incoming message   |
| `POLICY_VIOLATION`   | **-25.0**   | Peer attempted an unapproved or blocked operation       |
| `MALFORMED_MESSAGE`  | **-10.0**   | Message failed JSON schema or wire format validation    |
| `REPLAY_ATTEMPT`     | **-30.0**   | Peer reused an existing nonce within timestamp window   |
| `USER_REPORT`        | **-15.0**   | Operator manually logged an anomaly                     |

## Evidence Log

Each delta change appends an immutable `ReputationEvent` recording:

- `event_id`: Unique event identifier
- `agent_id`: Target agent
- `event_type`: Category
- `request_id`: Associated capability request
- `timestamp`: UTC ISO timestamp
- `evidence_reference`: Verifiable proof string or log reference
- `score_delta`: Exact numerical change applied

## Source Reference

- Implementation: [`packages/network/src/reputation/reputation-manager.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/reputation/reputation-manager.ts)
- Types: [`packages/network/src/types/index.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/types/index.ts)
