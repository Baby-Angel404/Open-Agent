# Security Audit Findings & Vulnerability Register

## Finding Summary Matrix

| ID | Component | Vulnerability Class | Severity | Status |
| --- | --- | --- | --- | --- |
| **OA-SEC-001** | `packages/vector/src/storage/fs.storage.ts` | Path Traversal via Collection ID (CWE-22 / CWE-73) | **CRITICAL** | **Remediated & Verified** |
| **OA-SEC-002** | `packages/core/src/policy/engine.ts` | Subdomain Wildcard Pattern Matching Bypass (CWE-297) | **HIGH** | **Remediated & Verified** |
| **OA-SEC-003** | `packages/core/src/api/server.ts` | Host Header Spoofing & DNS Rebinding Vulnerability (CWE-346) | **HIGH** | **Remediated & Verified** |
| **OA-SEC-004** | `apps/desktop/src/main/backup.ts` | Path Prefix Sibling Traversal in Restore Engine (CWE-22) | **MEDIUM** | **Remediated & Verified** |
| **OA-SEC-005** | `packages/network/src/protocol/authenticator.ts` | Unbounded Nonce Cache Memory Exhaustion / DoS (CWE-400) | **MEDIUM** | **Remediated & Verified** |
| **OA-SEC-006** | `apps/desktop/src/main/vault.ts` | Predictable Static Default Master Secret in CredentialVault (CWE-798) | **MEDIUM** | **Remediated & Verified** |
| **OA-SEC-007** | `packages/core/src/audit/store.ts` | Silent Suppression of Corrupted Log Records on Load (CWE-390) | **LOW** | **Remediated & Verified** |
| **DEP-SEC-001** | `apps/desktop` (devDependency: `extract-zip@2.0.1`) | Symlink Path Traversal in Zip Extraction (GHSA-jmr9-qjv8-65gv) | **HIGH** | **Documented Residual Risk (Compensating Controls)** |
| **DEP-SEC-002** | `apps/desktop` (devDependency: `electron@30.5.1`) | ASAR Integrity Bypass & Upstream Advisories (GHSA-vmqv-hx8q-j7mg) | **HIGH** | **Documented Residual Risk (Compensating Controls)** |
| **DEP-SEC-003** | `apps/desktop` (devDependency: `sprintf-js@1.1.3`) | Unbounded Precision Specifier DoS (GHSA-hp3w-g68c-fv3c) | **MODERATE** | **Documented Residual Risk (Compensating Controls)** |

---

### OA-SEC-001: Path Traversal via Collection ID in Vector Storage Backend

- **Component**: `@open-agent/vector` (`packages/vector/src/storage/fs.storage.ts:94-118`).
- **Description**: The `FileSystemStorageBackend` class constructs the directory path for collection records using `path.basename(collectionId)`. On POSIX systems, `path.basename("..")` returns `".."`. When `collectionId` is set to `".."`, the path resolves to the parent directory (`basePath`), allowing arbitrary record overwriting outside the `collections/` directory and complete deletion of `basePath` (including `manifest.json`) when `deleteCollection("..")` is called.
- **Preconditions**: An agent session, CLI command, or API call requests creation, insert, or deletion of a collection named `".."` or containing path segments.
- **Evidence**:
  ```typescript
  private getCollectionRecordPath(collectionId: string): string {
    const safeId = path.basename(collectionId); // Returns ".." if collectionId is ".."
    return path.join(this.collectionsDir, safeId, "records.jsonl");
  }
  ```
- **Impact**: Arbitrary file creation/deletion, potential database destruction, host file write if `basePath` is customized.
- **Severity**: **CRITICAL** (CVSS 9.1).
- **Remediation**: Validate that `collectionId` matches a strict alphanumeric and dash/underscore regex `^[a-zA-Z0-9_-]+$` with length constraints (1–64 characters). Disallow relative symbols like `.` and `..`.

---

### OA-SEC-002: Subdomain Wildcard Pattern Matching Bypass in PolicyEngine

- **Component**: `@open-agent/core` (`packages/core/src/policy/engine.ts:131-134`).
- **Description**: The policy engine's pattern matcher evaluates wildcard domains of the form `*.example.com` using `target.endsWith(suffix)`. If `pattern` is `*.example.com`, `suffix` is `example.com`. A malicious domain `evilexample.com` or `phishingexample.com` satisfies `target.endsWith("example.com")`, incorrectly granting it permissions intended only for legitimate subdomains of `example.com`.
- **Preconditions**: Policy contains a wildcard rule `*.target.com` with decision `ALLOW`.
- **Evidence**:
  ```typescript
  if (pattern.startsWith("*.") && target.includes(".")) {
    const suffix = pattern.slice(2);
    return target.endsWith(suffix); // "evilexample.com".endsWith("example.com") === true!
  }
  ```
- **Impact**: Policy bypass allowing unapproved malicious domains to execute without authorization or user confirmation.
- **Severity**: **HIGH** (CVSS 8.2).
- **Remediation**: Extract the canonical hostname and verify that either `hostname === suffix` or `hostname.endsWith("." + suffix)`.

---

### OA-SEC-003: Host Header Spoofing & DNS Rebinding Vulnerability in LocalAPIServer

- **Component**: `@open-agent/core` (`packages/core/src/api/server.ts:146-175`).
- **Description**: The `LocalAPIServer` inspects the HTTP `Origin` header if present, but fails to validate the HTTP `Host` header. Under a DNS rebinding attack, an attacker controls a domain (e.g., `attacker.com`) that resolves to `127.0.0.1` after page load. Requests originating from the browser do not send a cross-origin `Origin` header for same-origin rebind requests, and the `Host` header is accepted indiscriminately, granting the attacker full remote control over local agent sessions, step execution, and data inspection.
- **Preconditions**: User visits an attacker-controlled website while OpenAgent desktop or CLI server is listening on `127.0.0.1`.
- **Evidence**:
  ```typescript
  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  // No validation of req.headers.host against localhost / 127.0.0.1 / ::1
  ```
- **Impact**: Remote Code Execution (RCE) via agent step execution and arbitrary local data exfiltration.
- **Severity**: **HIGH** (CVSS 8.8).
- **Remediation**: Strictly validate `req.headers.host`. Reject with 403 Forbidden any request where `host` does not match `127.0.0.1`, `localhost`, `[::1]`, or loopback ports.

---

### OA-SEC-004: Path Prefix Sibling Traversal in Desktop Restore Engine

- **Component**: `@open-agent/desktop` (`apps/desktop/src/main/backup.ts:182-185`).
- **Description**: In `restoreBackup`, the path boundary check verifies `resolved.startsWith(this.appDataDir)`. If `appDataDir` is `/var/app/data`, a malicious archive containing a path resolving to `/var/app/data_backdoor/malicious.js` passes the check because string prefix matching succeeds without requiring a directory separator boundary.
- **Preconditions**: User restores a crafted backup archive.
- **Evidence**:
  ```typescript
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(this.appDataDir)) {
    throw new Error(`Security violation: Path escape detected for ${resolved}`);
  }
  ```
- **Impact**: File write to unintended sibling directories on the host system.
- **Severity**: **MEDIUM** (CVSS 6.5).
- **Remediation**: Enforce `resolved === this.appDataDir || resolved.startsWith(this.appDataDir + path.sep)`.

---

### OA-SEC-005: Unbounded Nonce Cache Memory Exhaustion / DoS in MessageAuthenticator

- **Component**: `@open-agent/network` (`packages/network/src/protocol/authenticator.ts:18, 166-178`).
- **Description**: The `MessageAuthenticator` caches received message nonces in `this.seenNonces` Map to prevent replay attacks. However, the cache has no capacity ceiling. A flood of distinct nonces sent by peers can consume unbounded heap memory until the process terminates due to Out-Of-Memory (OOM).
- **Preconditions**: A peer transmits a high volume of unique messages.
- **Evidence**:
  ```typescript
  this.seenNonces.set(nonceKey, now + this.limits.clock_skew_tolerance_ms);
  // No upper size bound or LRU/FIFO eviction
  ```
- **Impact**: Denial of Service (crash of network node).
- **Severity**: **MEDIUM** (CVSS 5.3).
- **Remediation**: Enforce a maximum capacity (e.g., 50,000 nonces) and evict oldest nonces when limit is approached.

---

### OA-SEC-006: Predictable Static Default Master Secret in CredentialVault

- **Component**: `@open-agent/desktop` (`apps/desktop/src/main/vault.ts:28-31`).
- **Description**: `CredentialVault` derives its master AES-256 key from `process.env.OPENAGENT_VAULT_KEY` with a static fallback string `"openagent-local-desktop-vault-default"` and static salt `"openagent-salt-static-v1"`. If a user does not specify an environment variable, encrypted vaults copied between workstations or by local non-privileged processes can be trivially decrypted.
- **Preconditions**: User does not explicitly define `OPENAGENT_VAULT_KEY`.
- **Evidence**:
  ```typescript
  const effectivePassphrase =
    passphrase || process.env.OPENAGENT_VAULT_KEY || "openagent-local-desktop-vault-default";
  ```
- **Impact**: Local credential compromise if encrypted storage is read.
- **Severity**: **MEDIUM** (CVSS 5.5).
- **Remediation**: If no environment variable or passphrase is supplied, generate a cryptographically random 256-bit machine-specific secret and store it in `.vault_key` with strict filesystem permissions (`0600`).

---

### OA-SEC-007: Silent Suppression of Corrupted Log Records on Load in AppendOnlyAuditStore

- **Component**: `@open-agent/core` (`packages/core/src/audit/store.ts:93-96`).
- **Description**: When reading existing log files on startup, any JSON parsing failure silently skips the line without recording a verification error or setting a corrupted flag. A subsequent append operation continues from the last successfully read hash, potentially concealing evidence of file tampering or incomplete writes.
- **Preconditions**: An audit log file undergoes disk truncation or partial line tampering.
- **Evidence**:
  ```typescript
  } catch {
    // Skip corrupted line in non-fatal load
  }
  ```
- **Impact**: Loss of auditability and false sense of integrity.
- **Severity**: **LOW** (CVSS 3.3).
- **Remediation**: Track and record corrupted lines encountered during loading, and flag them in `verifyIntegrity()`.

---

### DEP-SEC-001: extract-zip Symlink Path Traversal (GHSA-jmr9-qjv8-65gv / GHSA-7pqw-9j4j-h8q3)

- **Package**: `extract-zip@2.0.1` (transitive development dependency via `electron@30.5.1`).
- **Severity**: **HIGH** (CVSS 8.1).
- **Affected Range**: `<=2.0.1` (No upstream patched release currently published on npm registry).
- **Dependency Path**: `open-agent-infrastructure -> @open-agent/desktop (devDependencies) -> electron@30.5.1 -> extract-zip@2.0.1`.
- **Execution Analysis**:
  - `extract-zip` executes strictly during development `npm install` within `node_modules/electron/install.js` to unpack official Electron prebuilt binaries downloaded over HTTPS from GitHub Releases.
  - The package is **not** imported, bundled, or executed during production runtime, desktop application packaging (`tar -czf` used), or backup restore operations.
  - Application archive operations use `BackupEngine` with strict JSON/Base64 payloads and path traversal guards (`apps/desktop/src/main/backup.ts`).
- **Compensating Controls**:
  - `npm ci` verifies package checksum hashes against `package-lock.json`.
  - Zero application processing of ZIP archives or user-supplied zip files.
- **Disposition**: **Documented Residual Risk (Compensating Controls)**.
- **Owner**: Desktop Infrastructure Team.
- **Remediation Milestone**: v0.2.0 (Framework migration to modern toolchain decoupling legacy Electron postinstall scripts).

---

### DEP-SEC-002: Upstream Electron Vulnerabilities & ASAR Integrity Bypass (GHSA-vmqv-hx8q-j7mg et al.)

- **Package**: `electron@30.5.1` (direct development dependency in `apps/desktop/package.json`).
- **Severity**: **HIGH** (CVSS 8.2).
- **Affected Range**: `<=41.10.5` (Requires SemVer major upgrade across 11-14 major versions).
- **Dependency Path**: `apps/desktop/package.json` (`devDependencies.electron`).
- **Execution Analysis**:
  - OpenAgent Desktop **does not use ASAR archives**; code is distributed as loose unpacked directories under `resources/app/` (`apps/desktop/scripts/package.js`), rendering ASAR integrity bypasses inapplicable.
  - Desktop main process is hardened with defense-in-depth settings (`apps/desktop/src/main/index.ts`):
    - `contextIsolation: true`
    - `nodeIntegration: false`
    - `sandbox: true`
    - `setPermissionRequestHandler: callback(false)` (unconditionally blocks all web permissions)
    - `setWindowOpenHandler: { action: "deny" }` (blocks popup windows and untrusted navigation)
    - `preload/index.ts` exposes only explicitly whitelisted IPC channels.
- **Compensating Controls**: Sandboxed local-only renderer, strict IPC channel whitelist, zero external web navigation.
- **Disposition**: **Documented Residual Risk (Compensating Controls)**.
- **Owner**: Desktop Infrastructure Team.
- **Remediation Milestone**: v0.2.0 (Framework upgrade to supported LTS Electron release branch after full compatibility qualification).

---

### DEP-SEC-003: sprintf-js Unbounded Precision Specifier Denial of Service (GHSA-hp3w-g68c-fv3c)

- **Package**: `sprintf-js@1.1.3` (transitive development dependency via `electron -> @electron/get -> global-agent -> roarr`).
- **Severity**: **MODERATE** (CVSS 5.3).
- **Affected Range**: `<=1.1.3` (No upstream patched release published on npm registry).
- **Dependency Path**: `apps/desktop -> electron -> @electron/get -> global-agent -> roarr -> sprintf-js`.
- **Execution Analysis**:
  - Used exclusively by proxy logging in `@electron/get` during binary download at `npm install`.
  - Never loaded or executed in application runtime or production builds.
- **Compensating Controls**: No untrusted or user-controlled format strings are processed.
- **Disposition**: **Documented Residual Risk (Compensating Controls)**.
- **Owner**: Desktop Infrastructure Team.
- **Remediation Milestone**: v0.2.0.
