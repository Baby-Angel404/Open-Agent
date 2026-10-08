# Security Policy & Vulnerability Disclosure

OpenAgent Infrastructure is designed from the ground up on defense-in-depth, zero-trust, and deterministic fail-closed principles.

## Supported Versions

| Version | Supported          | Security Patches |
| ------- | ------------------ | ---------------- |
| 0.1.x   | :white_check_mark: | Active           |

## Security Architecture & Core Boundaries

1. **Deterministic Default-Deny**: Every proposed agent action must pass the Policy Engine before execution. Missing rules or unknown capabilities immediately result in `DENY`.
2. **Cryptographic Action Binding**: Once an action is approved, its payload is hashed into an HMAC approval token with expiration TTL. Mutated payloads fail closed.
3. **Tamper-Evident Hash-Chaining**: Audit logs are recorded in append-only JSONL files linked by continuous SHA-256 hash chains with strict sequence monotonic counters.
4. **Local Isolation & DNS Rebinding Protection**: Local API servers bind strictly to loopback (`127.0.0.1`) and reject external Host/Origin headers with HTTP 403.
5. **Decentralized Cryptographic Identity**: Remote network messages require Ed25519 digital signatures, monotonic nonces with replay caches, and clock-skew bounds.
6. **Encrypted Credential Storage**: Desktop vaults encrypt sensitive secrets with authenticated AES-256-GCM using per-installation machine keys with `0600` permissions.

## Reporting a Vulnerability

We treat all security vulnerabilities seriously. Please **DO NOT** report security vulnerabilities via public GitHub issues, PRs, or public discussions.

### Reporting Process

1. **Email / Private Advisory**:
   - Send report to `security@openagent.org` or submit via GitHub Private Vulnerability Reporting on this repository.
   - PGP Key ID: Available upon request or via security team keyservers.

2. **Report Contents**:
   - Detailed description of the vulnerability and attack vector.
   - Affected component(s) (`core`, `vector`, `graph`, `network`, `cli`, `desktop`).
   - Minimal reproducible Proof-of-Concept (PoC) code or step-by-step reproduction guide.
   - Assessment of impact (e.g. policy bypass, remote code execution, replay attack, data leakage).

3. **Response SLAs**:
   - **Initial Acknowledgement**: Within 48 hours.
   - **Triage & Severity Assessment**: Within 5 business days.
   - **Remediation & Patch Target**: Critical vulnerabilities within 14 days; High within 30 days.
   - **Public Disclosure**: Coordinated release with 90-day embargo from initial report unless mutually agreed earlier.
