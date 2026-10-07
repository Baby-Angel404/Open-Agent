# OpenAgent Infrastructure

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Status: Early Development](https://img.shields.io/badge/Status-Early_Development-orange.svg)](<>)
[![Security: Default--Deny](https://img.shields.io/badge/Security-Default--Deny-red.svg)](<>)
[![Privacy: Local--Only](https://img.shields.io/badge/Privacy-100%25_Local--Only-green.svg)](<>)

> **Notice**: OpenAgent Infrastructure is an **early-stage development project**. It is actively being architected and is **not yet production-ready**.

OpenAgent Infrastructure provides the foundational architectural components for secure, deterministic, policy-controlled autonomous AI agents. The platform strictly enforces **Default-Deny** security for sensitive actions, local-only execution without telemetry or cloud tracking, and append-only cryptographic audit logging.

---

## High-Level Vision (Phased Roadmap)

The long-term vision encompasses three major systems, built strictly incrementally:

1. **Policy-Controlled Local Browser Agents**: Sandbox DOM execution, token-level guards, deterministic session replay.
2. **Local Hybrid Vector + Graph RAG**: Embedded hybrid dense/sparse vector search with local automated knowledge graph expansion.
3. **Decentralized Agent Capability Networking**: Peer-to-peer discovery and capability invocation without central gatekeepers.

_Current Phase: Phase 0 (Bootstrap Core, Deterministic Policy Engine, Local Audit Log, and CLI)._

---

## Architecture Overview

```
USER
  │
  ▼
AI AGENT (LLM / Planner)
  │
  ▼ (Proposes Action)
PROPOSED ACTION { type, target, payload }
  │
  ▼
┌────────────────────────────────────────────────────────┐
│               DETERMINISTIC POLICY ENGINE              │
│                                                        │
│  - Strict Schema Validation                            │
│  - Domain Whitelist / Blacklist Enforcement            │
│  - Inherently Sensitive Actions Registry               │
│  - Rate Limiting Checks                                │
│  - Strict DEFAULT-DENY Fallback                        │
└────────────────────────────────────────────────────────┘
  │
  ├── ALLOW ──────► EXECUTOR ──────► APPEND TO LOCAL AUDIT LOG
  ├── ASK_USER ───► INTERACTION PROMPT ──► USER DECISION
  ├── LIMITED ────► THROTTLED NOTICE
  └── DENY ───────► BLOCKED ACTION ──► APPEND TO LOCAL AUDIT LOG
```

---

## Directory Structure

```
open-agent-infrastructure/
├── apps/
│   └── cli/                      # Command-line interface (`openagent`)
├── packages/
│   └── core/                     # Shared core contracts, PolicyEngine, LocalAuditLogger
├── crates/                       # Reserved for future high-performance Rust primitives
├── services/                     # Reserved for future local background daemons
├── examples/
│   └── policies/                 # Sample policy definitions (default-security-policy.json)
├── tests/                        # Integration test harnesses
├── docs/                         # In-depth architectural and design documentation
└── scripts/                      # Setup and verification tooling
```

---

## Quickstart & Development Commands

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Git >= 2.x

### Commands

```bash
# Install dependencies across all workspaces
npm install

# Build all packages and CLI
npm run build

# Run comprehensive test suites
npm run test

# Run strict type checking
npm run typecheck

# Code formatting check
npm run format:check

# Auto-format all code
npm run format
```

### CLI Usage Example

```bash
# Check infrastructure status
node apps/cli/dist/bin/openagent.js agent status

# Evaluate an action against default security policy
node apps/cli/dist/bin/openagent.js policy check --action navigate --target https://example.com

# Verify default-deny on sensitive action without permissions
node apps/cli/dist/bin/openagent.js policy check --action shell_exec

# Inspect policy rules
node apps/cli/dist/bin/openagent.js policy list

# Inspect local audit trail
node apps/cli/dist/bin/openagent.js audit list
```

---

## Core Guarantees

1. **Deterministic Security**: The Policy Engine does not rely on an LLM to decide whether an action is safe.
2. **Default-Deny**: Any sensitive action without an explicit rule is rejected.
3. **Local-Only Operation**: No tracking, telemetry, cloud beacons, or remote log forwarders.
4. **Append-Only Tamper-Resistant Auditing**: Every evaluated event produces a SHA-256 hash-chained log entry.

---

## Documentation Links

- [Architecture Guide](docs/architecture.md)
- [Technology Decisions](docs/technology-decisions.md)
- [Security Model & Defaults](docs/security.md)
- [Policy Engine Specification](docs/policy-engine.md)
- [Development Guidelines](docs/development.md)

---

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
