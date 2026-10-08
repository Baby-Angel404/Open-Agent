# OpenAgent Infrastructure

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Status: Productized](https://img.shields.io/badge/Status-Phase_8_Desktop_Productized-green.svg)](<>)
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

## Documentation Links

- [Desktop Architecture](docs/desktop-architecture.md)
- [Desktop Security & Isolation](docs/desktop-security.md)
- [Installation Guide](docs/installation.md)
- [Building & Packaging](docs/building.md)
- [Backup, Verification & Restore](docs/backup-and-restore.md)
- [Troubleshooting Guide](docs/troubleshooting.md)
- [Platform Support Matrix](docs/platform-support.md)
- [Updates & Releases](docs/updates-and-releases.md)
- [Privacy Policy](docs/privacy.md)
- [Phase 8 Assessment](docs/phase-8-assessment.md)

---

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
