# Security Policy

OpenAgent Infrastructure is built from the ground up on defense-in-depth and default-deny principles.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Defaults

- **Default-Deny for Sensitive Actions**: All actions matching file system access, code execution, credential reading, and network mutation are denied unless explicitly permitted by an authorized policy rule.
- **Air-Gapped Audit**: The local audit logger uses append-only SHA-256 hash chains. It does not transmit data over the network.
- **Deterministic Evaluation**: Policy evaluations do not query external APIs or LLMs.

## Reporting a Vulnerability

If you discover a security vulnerability, please do NOT create a public issue. Instead, report it privately to:

- Email: `security@openagent.internal` (or via private GitHub Vulnerability Reporting)

Please include:

1. Steps to reproduce the issue.
2. The policy and action payload involved.
3. Expected vs actual behavior.
