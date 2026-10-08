# Observability & Metrics Specification

## 1. Local-Only Philosophy

OpenAgent Infrastructure operates with zero cloud phone-home, zero remote telemetry, and zero third-party logging collectors. All observability data is maintained in local memory and verifiable local files.

---

## 2. Metrics Architecture

The `LocalMetricsCollector` tracks performance and security events in real time:

### 2.1 Tracked Metrics

- **Session Lifecycle**: Created, completed, failed, stopped, and active session counts.
- **Action Counters**: Proposed, allowed, denied, executed, failed, and blocked action counts.
- **Policy Latency Histogram**: Min, Max, Avg, p50, p95, p99 evaluation latencies (sampled over a rolling 5,000-eval buffer).
- **Security Violations**: Categorized by severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`) and category rules.
- **System Health**: Memory RSS usage, platform architecture, uptime in seconds.

---

## 3. Metrics Snapshot Format

```json
{
  "timestamp": "2026-10-08T00:15:00.000Z",
  "uptimeSeconds": 120,
  "sessions": {
    "created": 4,
    "completed": 2,
    "failed": 2,
    "stopped": 0,
    "active": 0
  },
  "actions": {
    "proposed": 12,
    "allowed": 6,
    "denied": 6,
    "executed": 6,
    "failed": 0,
    "blocked": 6
  },
  "policyLatency": {
    "count": 12,
    "p50Ms": 0.082,
    "p95Ms": 0.315,
    "p99Ms": 0.45
  },
  "securityViolations": {
    "bySeverity": {
      "CRITICAL": 0,
      "HIGH": 1,
      "MEDIUM": 2,
      "LOW": 0
    },
    "totalAlerts": 1
  }
}
```

---

## 4. Endpoints & CLI Commands

- CLI Summary: `openagent metrics`
- CLI JSON: `openagent metrics --json`
- Health check: `GET /health` -> `{ status: "HEALTHY", uptime, reasons }`
- API Metrics: `GET /api/v1/metrics`
- Web Dashboard: `http://127.0.0.1:4242/dashboard`
