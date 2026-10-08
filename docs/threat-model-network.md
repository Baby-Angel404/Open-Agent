# Network Threat Model & Mitigations

This document outlines the threat vectors relevant to decentralized agent capability sharing and their mitigations in OpenAgent Infrastructure.

## Threat Analysis

| Threat                            | Description                                                                             | Impact                      | Mitigation in OpenAgent                                                                                                                                |
| :-------------------------------- | :-------------------------------------------------------------------------------------- | :-------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sybil Attack**                  | Attacker spins up numerous ephemeral agent IDs to flood the network or skew reputation. | Disruption, spam            | Discovery != Trust. New peers start as `UNKNOWN`. Reputation gain is slow (+2) while penalties are severe (-30). Per-peer concurrency limits.          |
| **Agent Impersonation**           | Attacker crafts messages claiming to be a trusted agent ID.                             | Unauthorized access         | Ed25519 canonical preimage verification. Deterministic agent ID hash binding (`agent_<pubkey_fingerprint>`).                                           |
| **Replay Attacks**                | Attacker captures and retransmits legitimate messages.                                  | Duplicate execution         | Nonce cache with 10-minute sliding window and strict ±30s clock skew tolerance.                                                                        |
| **Malicious Capability Provider** | Provider returns poisoned data, prompt injections, or malformed payloads.               | Downstream agent corruption | Strict JSON Schema validation. Evidence provenance separation (`REMOTE EVIDENCE` tags). Sanitization of prompt injection delimiters.                   |
| **Remote Code Execution (RCE)**   | Remote agent attempts to execute shell commands, eval, or code on host.                 | System takeover             | Banned at registry registration via regex filters. Inherent denial in Policy Engine for `remote_execution`.                                            |
| **Data Exfiltration**             | Attacker invokes capabilities to siphon local secrets or confidential documents.        | Data breach                 | Data classification engine (`PUBLIC`/`INTERNAL`/`SENSITIVE`/`SECRET`). Automated regex secret leakage detection. Inherently sensitive action policies. |
| **Denial of Service (DoS)**       | Excessive request flooding to exhaust memory or CPU.                                    | Service degradation         | `ResourceGuard`: 2MB payload cap, 10 concurrent requests max, sliding-window rate limiters per peer and per capability.                                |

## Residual Risks & Recommendations

1. **Compromised Host**: If the local host OS is compromised, local private keys (`agent-identity.json`) could be read. Ensure file permissions remain `0600` and host OS is hardened.
2. **Untrusted External Networks**: In production environments, run transport over TLS/HTTPS rather than plain HTTP.
