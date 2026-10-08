# Security Remediation Plan & Execution Matrix

## 1. Remediation Strategy

All findings identified in `docs/security-audit/findings.md` will be remediated using minimal, safe code modifications accompanied by dedicated regression tests verifying that the vulnerable condition fails prior to the patch and passes cleanly afterward.

## 2. Remediation Execution Tasks

| ID             | Finding                              | Target File                                      | Action Item                                                                                         | Verification Test                                               |
| -------------- | ------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **OA-SEC-001** | Vector Collection Path Traversal     | `packages/vector/src/storage/fs.storage.ts`      | Validate collection IDs via `^[a-zA-Z0-9_-]{1,64}$`, reject `.` and `..`                            | `packages/vector/src/tests/security-path-traversal.test.ts`     |
| **OA-SEC-002** | Subdomain Pattern Matching Bypass    | `packages/core/src/policy/engine.ts`             | Enforce strict subdomain boundary check: `hostname === suffix \|\| hostname.endsWith("." + suffix)` | `packages/core/src/tests/security-policy-bypass.test.ts`        |
| **OA-SEC-003** | DNS Rebinding / Host Header Spoofing | `packages/core/src/api/server.ts`                | Enforce strict Host header whitelist against `localhost`, `127.0.0.1`, `[::1]` with optional port   | `packages/core/src/tests/security-dns-rebinding.test.ts`        |
| **OA-SEC-004** | Backup Restore Sibling Traversal     | `apps/desktop/src/main/backup.ts`                | Check `resolved === appDataDir \|\| resolved.startsWith(appDataDir + path.sep)`                     | `apps/desktop/src/tests/security-backup-boundary.test.ts`       |
| **OA-SEC-005** | Nonce Map Unbounded Growth           | `packages/network/src/protocol/authenticator.ts` | Add capacity ceiling (50,000) and FIFO pruning for oldest entries                                   | `packages/network/src/tests/security-authenticator-dos.test.ts` |
| **OA-SEC-006** | Vault Static Passphrase Fallback     | `apps/desktop/src/main/vault.ts`                 | Generate persistent local machine key file (`0600` permissions) when environment variable is unset  | `apps/desktop/src/tests/security-vault-entropy.test.ts`         |
| **OA-SEC-007** | Audit Log Silent Corruption          | `packages/core/src/audit/store.ts`               | Count and report corrupted lines during load in `verifyIntegrity()`                                 | `packages/core/src/tests/security-audit-corruption.test.ts`     |

---

## 3. Dedicated Security Regression Test Suite

All tests above will be consolidated into a master security regression test script:

```bash
npm run test:security
```

This guarantees continuous verification in local environments and GitHub Actions CI pipelines.
