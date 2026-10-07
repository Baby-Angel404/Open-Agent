# Security Model & Policy Defaults

OpenAgent Infrastructure operates under a strict defense-in-depth posture tailored for autonomous agents operating on user environments.

---

## 1. Default-Deny for Sensitive Actions

The policy engine maintains an internal list of inherently sensitive action primitives:

- `shell_exec`: Arbitrary command-line execution.
- `execute_code`: Dynamic code evaluation (eval/exec/WASM).
- `file_write`: Local file creation or modification.
- `file_delete`: Local file deletion.
- `download_file`: Uncontrolled file downloading.
- `read_credentials`: Accessing secrets, environment variables, or password fields.
- `submit_payment`: Financial or transaction submission.
- `network_exfiltrate`: Arbitrary outbound data egress.

**Rule**: If any action classified as sensitive lacks an explicit policy rule granting `ALLOW` or `ASK_USER`, the engine **always defaults to `DENY`**.

---

## 2. Threat Mitigations

| Threat                                   | Mitigation Mechanism                                                                                                                                                     |
| :--------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prompt Injection / Jailbreak**         | The LLM does not evaluate policies; the deterministic `PolicyEngine` enforces rules downstream.                                                                          |
| **Silent Exfiltration**                  | Core policy engine operates 100% locally with zero cloud telemetry. Network mutations require domain whitelist approval.                                                 |
| **Denial of Service / Loop Invocations** | Configurable `rateLimitPerMinute` per policy rule returns `LIMITED` when thresholds are breached.                                                                        |
| **Audit Log Tampering**                  | Audit records form a cryptographic SHA-256 hash chain: `hash = sha256(prev_hash + JSON(event))`. Tampering with any historical entry invalidates all subsequent entries. |

---

## 3. Data Privacy Guarantees

- No remote telemetry.
- No third-party analytics or crash reporters.
- All logs remain on the local machine in append-only JSONL files.
