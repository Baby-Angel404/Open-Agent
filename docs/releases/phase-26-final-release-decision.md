# Phase 26 — Final Release Governance & Publication Readiness Decision

**Review Date**: 2026-10-09  
**Candidate Version**: `0.2.0-alpha.1`  
**Candidate Branch**: `migration/electron-lts-v0.2.0`  
**Source Commit (HEAD)**: `3166cdaa7070bea2f37d2ab65791fdf78a54764f`  
**Protected Main Baseline**: `ca32fcc5dcbb64be3d910ca6ac26474ad581ba4f` (untouched)  
**Protected RC Tag**: `v0.1.0-rc1` at `231361a541997d6017e9df1c85c77fc2c54c70e3` (untouched)  
**Historical Linux RC Archive SHA-256**: `0fa12457faaf239e1fb5528b906de265d0799301b86e2763e30c100069fca7c4` (intact)  
**Candidate Artifact**: `release/staging/openagent-desktop-0.2.0-alpha.1-linux-x64.tar.gz`  
**Candidate Artifact SHA-256**: `32195d43211588a35f43c835c0862be32885cd2fcf0c15b3db34f1b0cb4902b7`  

---

## 1. Executive Summary

Phase 26 executed a comprehensive release governance and publication readiness audit for the OpenAgent desktop candidate following the Phase 25 verification.

The technical migration, security architecture, regression testing, and build reproducibility have all succeeded without defect. However, release governance identified an internal version metadata discrepancy: the candidate distribution archive and release documentation designate `0.2.0-alpha.1`, while the internal package manifests (`package.json`, `apps/desktop/package.json`, `packages/*/package.json`) and SBOM records retain `0.1.0`.

Per release policy instructions, version numbers must not be modified unilaterally without project-owner authorization. Therefore, this release candidate is evaluated as:

**CONDITIONAL — RELEASE BLOCKED PENDING REMEDIATION**

---

## 2. Gate-by-Gate Evaluation Matrix

| Gate # | Mandatory Release Gate | Evidence & Observation | Gate Evaluation |
| :---: | :--- | :--- | :---: |
| **1** | **Repository Integrity & Source Provenance** | Branch `migration/electron-lts-v0.2.0` at `3166cda`. `main` at `ca32fcc` and tag `v0.1.0-rc1` intact. Historical archive SHA-256 verified. Clean working tree. | **PASS** |
| **2** | **Dependency Audit & Security Remediation** | `npm audit` reports 0 vulnerabilities. Legacy vulnerable dependencies (`extract-zip@2.0.1`, `sprintf-js@1.1.3`, `roarr`, `global-agent`) completely purged. | **PASS** |
| **3** | **Functional & Security Regression Tests** | `npm run typecheck` (0 errors), `npm run lint` (0 errors), `npm run test:security` (15/15 passed), `npm test` (139/139 passed across 37 test files). | **PASS** |
| **4** | **Linux x64 Package Startup & Smoke Test** | Staging archive unpacks cleanly. Packaged application loads `@open-agent/core` runtime cleanly. Runtime verified: Electron 41.10.7, Node 24.18.0, Chromium 146.0.7680.216. | **PASS** |
| **5** | **Checksum & Supply-Chain / SBOM Integrity** | Staging archive matches `release/staging/checksums.txt` (`32195d43...b7`). Bit-for-bit reproducibility verified. CycloneDX 1.5 and SPDX 2.3 SBOMs validated. | **PASS** |
| **6** | **Release Version & Metadata Consistency** | **Discrepancy Detected**: Staging archive is named `openagent-desktop-0.2.0-alpha.1-linux-x64.tar.gz`, but root and workspace manifests (`package.json`, `apps/desktop/package.json`, etc.) remain at `0.1.0`. | **BLOCKED** |
| **7** | **Licensing & Third-Party Notices** | Apache 2.0 root license present. Bundled distribution includes Electron MIT license and Chromium notices (`LICENSES.chromium.html`). `SECURITY.md` and `CONTRIBUTING.md` present. | **PASS** |
| **8** | **User-Facing Documentation & Rollback Guide** | Created `docs/releases/v0.2.0-alpha.1-release-notes.md`. Rollback procedure back to `v0.1.0-rc1` detailed in `docs/releases/rollback-and-incident-guide.md`. | **PASS** |
| **9** | **Explicit Platform Support Statement** | Platform scope strictly limited to Linux x86_64 (`x64`). Windows and macOS explicitly documented as unvalidated and NOT RUN. | **PASS** |
| **10** | **Unresolved Release-Blocking Issues** | Technical vulnerabilities: 0. Remaining blocker: version metadata synchronization requiring project-owner decision. | **BLOCKED** |

---

## 3. Discrepancy & Unresolved Issues Details

### Version Metadata Desynchronization
* **Observation**:
  * Staging archive filename: `openagent-desktop-0.2.0-alpha.1-linux-x64.tar.gz`
  * Release notes: `docs/releases/v0.2.0-alpha.1-release-notes.md`
  * Manifests: Root `package.json`, `apps/desktop/package.json`, `apps/cli/package.json`, and `packages/*/package.json` declare `"version": "0.1.0"`.
  * Generated SBOMs: `release/staging/sbom.cyclonedx.json` and `sbom.spdx.json` record `@open-agent/*@0.1.0`.
* **Impact**:
  * Users running `openagent --version` or inspecting package metadata from the CLI/desktop package will observe `0.1.0` while the release tag and download archive indicate `0.2.0-alpha.1`.
* **Policy Mandate**:
  * Rules prohibit altering version numbers without explicit release policy authorization.

---

## 4. Supply-Chain & Artifact Provenance Record

* **Archive Path**: `release/staging/openagent-desktop-0.2.0-alpha.1-linux-x64.tar.gz`
* **File Size**: 117,963,131 bytes (~112.5 MB)
* **SHA-256 Digest**: `32195d43211588a35f43c835c0862be32885cd2fcf0c15b3db34f1b0cb4902b7`
* **Source Commit**: `3166cdaa7070bea2f37d2ab65791fdf78a54764f` on `migration/electron-lts-v0.2.0`
* **Development Toolchain**: Node.js 24.19.0 (build host), npm 10.8.2
* **Target Runtime**: Electron 41.10.7, Chromium 146.0.7680.216, embedded Node.js 24.18.0
* **Packaging Flags**: `tar --sort=name --mtime="2026-01-01 00:00:00Z" --owner=0 --group=0 --numeric-owner gzip -n`
* **Reproducibility**: Confirmed bit-for-bit identical SHA-256 across separate clean builds.
* **Historical Baseline Archive**: `release/desktop/openagent-desktop-linux-x64.tar.gz` (`0fa12457faaf239e1fb5528b906de265d0799301b86e2763e30c100069fca7c4`) preserved untouched.

---

## 5. Platform Scope

* **Linux x64 (`x86_64`)**: Fully verified and validated locally.
* **Windows & macOS**: Explicitly **NOT RUN** and unvalidated.

---

## 6. Final Decision & Actionable Remediation Plan

### Decision Outcome

**`CONDITIONAL — RELEASE BLOCKED PENDING REMEDIATION`**

### Required Action Items to Unblock Publication

1. **Project-Owner Version Strategy Decision**:
   * **Option A (Recommended)**: Approve synchronized bump of root `package.json`, workspace manifests (`apps/desktop`, `apps/cli`, `packages/*`), and regeneration of SBOMs to `0.2.0-alpha.1`.
   * **Option B**: Retain `0.1.0` and rename candidate archive to `openagent-desktop-0.1.0-electron41-linux-x64.tar.gz`.
2. **Execution of Version Synchronization (upon approval)**:
   * Apply approved version bump across manifests.
   * Regenerate `npm run package:desktop` and `npm run sbom`.
   * Re-verify clean `npm ci`, test suites (139/139), and deterministic checksum manifest.
3. **Formal Publication Step (Owner Authorized)**:
   * Once Option A or B is implemented and verified, transition decision to `APPROVED FOR EXPLICIT PUBLICATION AUTHORIZATION` for owner-driven tag and release creation.
