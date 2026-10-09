# OpenAgent Infrastructure

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Status: Release Candidate v0.1.0-rc1](https://img.shields.io/badge/Status-v0.1.0--rc1-blue.svg)](docs/releases/release-candidate-checklist.md)
[![Security: Default--Deny](https://img.shields.io/badge/Security-Default--Deny-red.svg)](<>)
[![Privacy: Local--Only](https://img.shields.io/badge/Privacy-100%25_Local--Only-green.svg)](<>)

OpenAgent Infrastructure provides the foundational architectural components for secure, deterministic, policy-controlled autonomous AI agents. The platform strictly enforces **Default-Deny** security for sensitive actions, local-only execution without telemetry or cloud tracking, append-only cryptographic audit logging, hybrid vector and Graph RAG, decentralized peer networking, and a cross-platform desktop application.

---

## Architecture Overview

```text
                                  USER INTERFACE
             ┌───────────────────────────┴───────────────────────────┐
             ▼                                                       ▼
      [Desktop Application]                                    [Command-Line CLI]
  (Electron + Secure Preload IPC)                          (openagent / npx openagent)
             │                                                       │
             └───────────────────────────┬───────────────────────────┘
                                         ▼
                             AGENT RUNTIME SUPERVISOR
                                         │
                                         ▼ (Proposes Action)
                           PROPOSED ACTION { type, target }
                                         │
                                         ▼
             ┌───────────────────────────────────────────────────────┐
             │              DETERMINISTIC POLICY ENGINE              │
             │  - Strict Schema Validation                           │
             │  - Domain Whitelist / Blacklist Enforcement           │
             │  - Inherently Sensitive Actions Registry              │
             │  - Strict DEFAULT-DENY Fallback                       │
             └───────────────────────────────────────────────────────┘
                                         │
                   ┌─────────────────────┼─────────────────────┐
                   ▼                     ▼                     ▼
                 ALLOW                ASK_USER               DENY
                   │                     │                     │
                   ▼                     ▼                     ▼
             [EXECUTOR]          [USER PROMPT]         [BLOCKED ACTION]
                   │
    ┌──────────────┴──────────────┬───────────────────────────┐
    ▼                             ▼                           ▼
[Browser Agent]         [Hybrid Vector & Graph RAG]   [P2P Capability Network]
    │                             │                           │
    └─────────────────────────────┼───────────────────────────┘
                                  ▼
                   [APPEND-ONLY CRYPTOGRAPHIC AUDIT]
                    (SHA-256 Hash-Chained Verification)
```

---

## Subsystems & Directory Structure

```text
open-agent-infrastructure/
├── apps/
│   ├── desktop/                  # Cross-platform desktop application (Electron, Preload, Sandboxed UI)
│   └── cli/                      # Command-line interface (`openagent`)
├── packages/
│   ├── core/                     # Agent runtime, PolicyEngine, AuditStore, Executors, Local API
│   ├── vector/                   # Lightweight hybrid dense + sparse vector engine
│   ├── graph/                    # Knowledge graph storage, entity resolver, Graph RAG engine
│   └── network/                  # Decentralized P2P agent network, identity, capability registry
├── docs/                         # Comprehensive engineering, security, and operational documentation
```

---

## Desktop Application Workspaces

The desktop application provides seven integrated workspaces:

1. **System Status**: Real-time health metrics, active subsystem states, uptime, and loopback gateway details.
2. **Agent Workspace**: Task execution sessions, step-by-step progress tracking, interactive action approvals, and audit event streams.
3. **Browser Controls**: Policy-controlled browser agent navigation, DOM interactions, and security checks.
4. **Knowledge & RAG**: Knowledge document ingestion, hybrid vector + graph retrieval, and entity relationship visualization.
5. **Network Explorer**: Decentralized node credentials, peer discovery, and authenticated remote capability invocation.
6. **Capabilities & Plugins**: Local capability registry catalog, risk level classification, and dynamic registration.
7. **Settings & Security Center**: Strict security enforcement, AES-256-GCM Credential Vault, and atomic backup/restore with integrity checks.

---

## Quickstart & Development Commands

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Git >= 2.x

### Build & Test

```bash
# Install dependencies across all workspaces
npm install

# Build all packages, CLI, and desktop application
npm run build

# Run all test suites across monorepo
npm test

# Run strict type checking
npm run typecheck

# Launch Desktop App in Development Mode
npm start --workspace=@open-agent/desktop
```

### Packaging for Release

Generate a standalone directory and compressed release package for your host OS:

```bash
npm run package:desktop
```

This produces:

- `apps/desktop/release/openagent-desktop/`: Standalone application directory.
- `apps/desktop/release/openagent-desktop-linux-x64.tar.gz`: Verified distribution tarball.
- `apps/desktop/release/openagent-desktop-linux-x64.tar.gz.sha256`: SHA-256 verification checksum.

---

## Feature Implementation & Roadmap

| Subsystem / Feature                | Maturity Status | Notes                                                                     |
| :--------------------------------- | :-------------- | :------------------------------------------------------------------------ |
| **Deterministic Policy Engine**    | **Completed**   | Full schema validation, domain rules, fail-closed default-deny.           |
| **Local AI Agent Runtime**         | **Completed**   | Step execution loop, emergency kill-switch, interactive approvals.        |
| **Controlled Browser Agent**       | **Completed**   | Navigation, DOM interaction, data transfer, protocol safety.              |
| **Tamper-Evident Audit Logging**   | **Completed**   | Append-only SHA-256 hash chains, monotonic indexing, replay engine.       |
| **Hybrid Vector Retrieval**        | **Completed**   | Dense cosine + BM25 sparse fusion, collection CRUD, local storage.        |
| **Knowledge Graph & Graph RAG**    | **Completed**   | Entity resolution, depth-bounded traversal, grounded citation generation. |
| **Decentralized Agent Network**    | **Completed**   | Ed25519 identity, wire signature authentication, capability invocation.   |
| **Desktop Productization**         | **Completed**   | Electron app, sandboxed renderer, secure preload IPC, local vault.        |
| **Distributed Capability Routing** | _Experimental_  | Multi-hop DHT routing across complex NAT environments.                    |
| **Hardware-Enclave Vault (TPM)**   | _Planned_       | Hardware-backed key derivation for enterprise deployments.                |

---

## Platform Support & Verification Status

| Platform    | Target Architecture   | Verification Status     | Release Package                                |
| :---------- | :-------------------- | :---------------------- | :--------------------------------------------- |
| **Linux**   | x86_64                | **Verified (RC Ready)** | Standalone dir, `.tar.gz`, `.desktop`          |
| **Linux**   | ARM64                 | Planned                 | Source build supported                         |
| **Windows** | x64 (10/11)           | **Untested (NOT RUN)**  | Blocked pending Windows CI runner & signing    |
| **macOS**   | Apple Silicon / Intel | **Untested (NOT RUN)**  | Blocked pending macOS CI runner & notarization |

---

## Community & Governance

- [Contributing Guide](CONTRIBUTING.md) — Architectural principles, PR standards, and local setup.
- [Code of Conduct](CODE_OF_CONDUCT.md) — Contributor community expectations and standards.
- [Security Policy](SECURITY.md) — Responsible vulnerability disclosure instructions and SLAs.
- [Governance Charter](GOVERNANCE.md) — Maintainer roles, decision consensus, and RFC processes.
- [Support & Channels](SUPPORT.md) — Troubleshooting resources and discussion channels.

---

## Documentation Links

- [Phase 10 Validation Results](docs/validation/phase-10-results.md)
- [Benchmark Results Baseline](docs/validation/benchmark-results.md)
- [Release Candidate Checklist](docs/releases/release-candidate-checklist.md)
- [Desktop Architecture](docs/desktop-architecture.md)
- [Desktop Security & Isolation](docs/desktop-security.md)
- [Installation Guide](docs/installation.md)
- [Building & Packaging](docs/building.md)
- [Backup, Verification & Restore](docs/backup-and-restore.md)
- [Troubleshooting Guide](docs/troubleshooting.md)
- [Platform Support Matrix](docs/platform-support.md)
- [Updates & Releases](docs/updates-and-releases.md)
- [Privacy Policy](docs/privacy.md)

---

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
