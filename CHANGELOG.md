# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-10-09

### Security & Remediations

- **Remediated OA-SEC-001 (CRITICAL)**: Implemented strict collection ID whitelist validation (`^[a-zA-Z0-9_-]{1,64}$`) and directory boundary checks in `FileSystemStorageBackend` and `HybridVectorEngine`, preventing arbitrary path traversal.
- **Remediated OA-SEC-002 (HIGH)**: Hardened wildcard domain matching in `PolicyEngine` to enforce strict subdomain dot boundaries, preventing domain suffix collision bypasses.
- **Remediated OA-SEC-003 (HIGH)**: Enforced strict Host and Origin header validation (`127.0.0.1`, `localhost`, `::1`) in `LocalAPIServer`, preventing DNS rebinding and cross-origin attacks.
- **Remediated OA-SEC-004 (MEDIUM)**: Enforced canonical path separator boundary validation in desktop `BackupEngine` `restoreBackup` and `verifyBackup`, eliminating sibling prefix path traversal.
- **Remediated OA-SEC-005 (MEDIUM)**: Bounded replay attack nonce cache (`max_cached_nonces: 50,000`) with automatic FIFO eviction in `MessageAuthenticator`, preventing memory exhaustion DoS.
- **Remediated OA-SEC-006 (MEDIUM)**: Replaced static default master vault secret with auto-generated machine-local 256-bit key persisted at `0600` permissions in `CredentialVault`.
- **Remediated OA-SEC-007 (LOW)**: Updated `AppendOnlyAuditStore` to track corrupted/unparseable lines on disk and fail `verifyIntegrity()`, preventing silent record loss.

### Added

- **Security Regression Suite**: Comprehensive 15-case automated regression suite in `packages/core/src/tests/security-regression-suite.test.ts`.
- **Supply Chain Security**: Added `scripts/generate-sbom.mjs` producing CycloneDX 1.5 JSON and SPDX 2.3 JSON Software Bills of Materials (`npm run sbom`).
- **Hardened CI/CD Workflows**: Pinned GitHub Actions to immutable SHAs, read-only token permissions, automated security regressions, and SBOM generation.
- **Release Automation**: Authored `release.yml` with checksum calculation (`SHA256SUMS`) and signed artifact release engineering.
- **Open-Source Governance**: Added `GOVERNANCE.md`, `SUPPORT.md`, `.github/CODEOWNERS`, PR template, and structured issue templates.
- **Release Documentation**: Authored `docs/releases/release-process.md`, `docs/releases/versioning.md`, and `docs/releases/artifact-verification.md`.

## [0.2.0] - 2026-10-08

### Added

- **Local AI Agent Runtime**: End-to-end execution loop strictly gated through PolicyEngine.
- **Action Model Expansion**: Supported `navigate`, `read`, `click`, `type`, `select`, `download`, `upload`, `submit` with full action metadata.
- **Modular Executor Architecture**: `NavigationExecutor`, `InteractionExecutor`, and `DataTransferExecutor` dispatched via token-verified `ExecutorDispatcher`.
- **LLM Provider Abstraction**: `LLMProvider` interface with `ScriptedPlanProvider` and `OpenAICompatibleProvider`.
- **Capability Registry**: `CapabilityRegistry` asserting known capabilities and rejecting unknown tool requests.
- **Session Management**: Full lifecycle transitions (`CREATED`, `RUNNING`, `WAITING_FOR_APPROVAL`, `COMPLETED`, `FAILED`, `STOPPED`) with history tracking.
- **User Approval Flow**: Pauses execution on `ASK_USER` with `APPROVE`, `DENY`, and `CANCEL_SESSION` user responses.
- **Emergency Stop**: High-priority kill switch cancelling active sessions and aborting pending actions.
- **Secret Redaction**: `SecretRedactor` automatically sanitizing passwords, API keys, tokens, and cookies before audit persistence.
- **Local API Server**: Versioned `/api/v1` REST endpoints for agents, sessions, policies, and audit events.
- **CLI Extensions**: Added `agent start`, `agent stop`, `session show`, and `audit show` commands.
- **Security Regression Suite**: Tests verifying fail-closed behavior against bypasses, tampering, and unapproved invocations.

## [0.1.0] - 2026-10-08

### Added

- **Phase 0 Bootstrap**: Empty workspace bootstrap and system detection.
- **Core Contracts**: Defined interfaces for `Agent`, `AgentAction`, `ActionResult`, `Policy`, `PolicyDecision`, `AuditEvent`, and `Session`.
- **Deterministic Policy Engine**: Full evaluation pipeline supporting `ALLOW`, `DENY`, `ASK_USER`, and `LIMITED`.
- **Strict Default-Deny**: Enforced automatic rejection of sensitive and unknown actions without explicit permissions.
- **Local Append-Only Audit Logger**: Implemented SHA-256 hash-chained local audit logging.
- **CLI Interface (`openagent`)**: Commands for `agent status`, `policy check`, `policy list`, `audit list`, and `session list`.
- **Automated Test Suites**: Tests for policy engine, validation errors, rate limits, audit verification, and CLI loader.
- **CI Workflow**: Basic GitHub Actions workflow for lint, typecheck, test, and build.
