# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
