# Contributing to OpenAgent Infrastructure

Thank you for your interest in contributing to OpenAgent Infrastructure. Because this project is security-critical and establishes foundational patterns for autonomous agents, all contributions must uphold strict engineering standards.

## Core Engineering Principles

1. **Fail-Closed Security**: All components, parsers, and policy evaluators must fail safely (`DENY` or fatal rejection) upon unknown states, malformed inputs, or missing credentials.
2. **Deterministic Evaluation**: Policy decisions must never rely on non-deterministic external services or LLM hallucinations.
3. **Defense-in-Depth**: Every boundary (API, network transport, desktop IPC, file storage) validates inputs independently.
4. **Reproducible & Test-Backed**: Every bugfix or feature must include automated regression tests covering normal paths, malformed payloads, and edge cases.
5. **Zero Plaintext Secrets**: Sensitive credentials and bearer tokens must never be written to logs or disk in plaintext.

## Development Setup

```bash
# Clone and setup
git clone https://github.com/openagent/openagent.git
cd openagent

# Install dependencies across all workspaces
npm install

# Build all packages and applications
npm run build

# Run monorepo test suites
npm test

# Run security regression tests
npm run test:security

# Typecheck and formatting verification
npm run typecheck
npm run format:check
```

## Pull Request Guidelines

1. **Branch Naming**: Use descriptive prefixes: `feat/`, `fix/`, `security/`, `docs/`, `refactor/`.
2. **Commit Conventions**: Follow Conventional Commits format:
   - `feat(core): add policy condition validator`
   - `fix(vector): prevent path traversal in storage backend`
   - `test(security): add test case for host header validation`
3. **Verification**: Ensure all checks (`npm test`, `npm run test:security`, `npm run typecheck`, `npm run format:check`) pass before submitting.
4. **Code Review**: At least one approval from a designated component code owner is required before merging.
