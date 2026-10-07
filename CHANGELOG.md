# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
