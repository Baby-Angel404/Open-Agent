# Contributing to OpenAgent Infrastructure

Thank you for your interest in contributing to OpenAgent Infrastructure. Because this project is security-sensitive and establishes foundational patterns for autonomous agents, we follow strict design and code quality requirements.

## Development Principles

1. **Security Defaults**: Any new action or protocol must default to `DENY` unless explicitly permitted.
2. **Local-Only**: No external network requests, telemetry, or remote logging in core modules.
3. **Deterministic Logic**: Core evaluation logic must never be delegated to stochastic models (e.g. LLMs).
4. **Strict Typing**: All code must pass `tsc --noEmit` without `any` casts or unvalidated inputs.
5. **Real Automated Tests**: Every PR must include tests that execute code paths and test edge cases.

## Workflow

1. Fork and create a branch from `main`.
2. Install dependencies: `npm install`.
3. Make changes and verify:
   ```bash
   npm run typecheck
   npm run test
   npm run format:check
   ```
4. Submit a Pull Request describing the problem, design decision, and testing verified.
