# Desktop Security & Isolation Architecture

## 1. Threat Model & Security Principles

OpenAgent operates under an adversarial threat model where:

1. Agent plans may originate from external LLMs or third-party plugins.
2. Peer agents on the network are untrusted by default.
3. Web pages visited by browser agents may contain malicious prompt injections.

To defend against privilege escalation, unauthorized persistence, data exfiltration, and lateral movement, OpenAgent implements defense-in-depth across the desktop layer.

## 2. Process & Window Isolation Boundaries

The desktop GUI enforces strict sandbox boundaries:

- `contextIsolation: true`: Prevents renderer scripts from accessing prototype modifications in preload scripts.
- `nodeIntegration: false`: Renderer has zero direct access to Node.js built-ins (`fs`, `child_process`, `net`, `os`).
- `sandbox: true`: Chromium OS sandbox restricts OS syscalls from renderer processes.
- **Content Security Policy (CSP)**:
  ```http
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  ```
- **External Navigation Lock**: All `window.open` calls and external link navigations are blocked or delegated to the system default browser through `setWindowOpenHandler({ action: 'deny' })`.
- **Permission Request Blocking**: All web platform permission requests (geolocation, camera, microphone, notifications) are unconditionally rejected via `setPermissionRequestHandler`.

## 3. IPC Whitelisting & Error Redaction

Every IPC invocation between the renderer and main process passes through:

1. **Channel Whitelist Guard**: Only channels enumerated in `IPC_CHANNELS` are accepted. Unknown channels are aborted immediately.
2. **Input Parameter Sanitization**: URL schemes must be strictly `http:` or `https:`. File paths containing relative traversal characters (`..`) or absolute system paths outside user data directories are rejected.
3. **Internal Error Redaction**: Exceptions thrown during backend execution are sanitized to prevent disclosing internal file system paths, machine environment variables, or private stack traces.

## 4. Encrypted Credential Vault

The `CredentialVault` manages sensitive API tokens and credentials:

- **Cipher**: AES-256-GCM authenticated encryption.
- **Key Derivation**: PBKDF2 (SHA-256, 100,000 iterations) with salted entropy.
- **Storage**: Stored in `vault/vault.enc` as ciphertext, IV, and GCM authentication tag.
- **Zero-Exposure Policy**: Secrets are decrypted only in memory when dispatched to authorized providers; secrets are never returned across IPC to renderer JavaScript, never written to audit logs, and never rendered in UI elements.

## 5. Path Traversal & Backup Integrity Protections

The `BackupEngine` enforces strict path normalization guards:

- Any file path in a backup manifest containing `..` or root prefixes is rejected as a security violation.
- Every archive entry is verified against its SHA-256 hash.
- Restores resolve files strictly within the application data directory (`appDataDir`).
