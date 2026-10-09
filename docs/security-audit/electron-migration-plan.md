# OpenAgent Infrastructure — Electron LTS Migration Plan (v0.2.0)

> **Document Status**: Draft Engineering Plan (Phase 21 Feasibility Study)  
> **Target Release Milestone**: `v0.2.0`  
> **Current Baseline**: Electron `30.5.1` (Bundles Node `20.16.0`, Chromium 124)  
> **Development Tooling**: Node.js `v20.18.0`, npm `10.8.2`, TypeScript `5.4.5` / `5.9.3`

---

## 1. Migration Motivation & Security Drivers

While OpenAgent Desktop v0.1.0-rc1 enforces rigorous compensating controls that prevent exploitation of known upstream vulnerabilities at runtime (e.g. non-ASAR unpacked filesystem distribution, strict renderer sandbox, and zero application zip extraction), Electron 30 has reached upstream End-of-Life (EOL).

Six development-toolchain audit advisories remain open in `npm audit`:

1. `GHSA-vmqv-hx8q-j7mg` and associated Chromium/Electron CVEs in `electron@30.5.1`.
2. `GHSA-jmr9-qjv8-65gv` & `GHSA-7pqw-9j4j-h8q3` in transitive `extract-zip@2.0.1`.
3. `GHSA-hp3w-g68c-fv3c` in transitive `sprintf-js@1.1.3` (via `@electron/get` -> `global-agent` -> `roarr`).

To achieve a clean upstream audit baseline and long-term security maintenance, OpenAgent will execute a coordinated framework upgrade in milestone `v0.2.0`.

---

## 2. Evaluation of Candidate Upgrade Targets

| Target Version                             | Chromium Version | Embedded Node.js | Development Node Requirement | Upstream Support Status | Packaging / Toolchain Impact                                                                                                                                                    |
| :----------------------------------------- | :--------------- | :--------------- | :--------------------------- | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Electron 32–34**                         | 128–132          | 20.16–20.18      | Node >= 20.9.0               | EOL                     | Retains legacy `@electron/get` and `extract-zip`. Does not resolve toolchain CVEs.                                                                                              |
| **Electron 35–39**                         | 134–140          | 22.x             | Node >= 12.20.55             | EOL                     | Compatible with Node 20 dev host, but still retains `extract-zip@2.0.1` and `sprintf-js@1.1.3`. All 6 advisories remain open.                                                   |
| **Electron Modern LTS (v41.10.7+ / v44+)** | 141+             | Node 24.x        | **Node >= 22.12.0**          | Active Supported LTS    | Replaces toolchain with `@electron-internal/extract-zip` and `@electron/get@5.1.0`, resolving advisories. **Fails on Node 20.18.0** with `ERR_REQUIRE_ESM` during `install.js`. |

### Critical Technical Constraint:

Authoritative testing on Node `20.18.0` demonstrated that modern Electron releases (`v41.10.7+` and `v44+`) cannot be installed on Node 20:

```
npm error Error [ERR_REQUIRE_ESM]: require() of ES Module /node_modules/@electron/get/dist/index.js
npm error from /node_modules/electron/install.js not supported.
```

Synchronous `require()` of ESM in `electron/install.js` is supported only on Node `>= 22.12.0`. Therefore, migrating to modern Electron has an explicit hard prerequisite: upgrading the project's development tooling and CI runners to **Node.js 22 LTS (`>= 22.12.0`)**.

### Recommended Migration Strategy:

1. **Prerequisite (Milestone v0.2.0-pre)**: Upgrade monorepo development engine baseline and CI runners to Node.js 22 LTS (`>= 22.12.0`), updating root `package.json` engines to `"node": ">=22.12.0"`.
2. **Framework Migration (Milestone v0.2.0)**: Upgrade `apps/desktop` to Electron Modern LTS (`v41.10.7+` / `v44+`) with `@electron-internal/extract-zip` and `@electron/get@5.1.0`, eliminating toolchain CVEs while preserving all existing sandbox and IPC security gates.

---

## 3. Technical Compatibility & Impact Analysis

### 3.1. Desktop Codebase Compatibility

- **Main Process (`apps/desktop/src/main/index.ts`)**:
  - `singleInstanceLock`: Fully supported without API changes.
  - `session.setPermissionRequestHandler`: Compatible across all candidate versions.
  - `BrowserWindow` webPreferences (`contextIsolation`, `nodeIntegration`, `sandbox`): Retains standard behavior.
  - `setWindowOpenHandler`: Continues to return `{ action: 'deny' }`.
- **Preload Script (`apps/desktop/src/preload/index.ts`)**:
  - `contextBridge.exposeInMainWorld`: Strict channel filtering and frozen API methods remain fully supported.
- **Native Modules**:
  - **Zero native C/C++ addons**: OpenAgent workspaces (`core`, `vector`, `graph`, `network`) are 100% pure TypeScript/JavaScript. No `node-gyp` or native ABI rebuilding compilation is required.

### 3.2. Packaging Script Updates (`apps/desktop/scripts/package.js`)

- Prebuilt binary location remains identical (`node_modules/electron/dist`).
- Packaging script must adopt normalized tarball generation flags (`--sort=name --mtime gzip -n`) directly into `package.js` to guarantee deterministic builds out of the box.

---

## 4. Staged Execution Plan (Phase by Phase)

1. **Stage 1: Branch Isolation**
   - Create dedicated feature branch: `feature/electron-lts-migration`.
2. **Stage 2: Package Manifest & Lockfile Upgrade**
   - Update `apps/desktop/package.json` to target Electron version.
   - Run clean `npm install` and audit lockfile changes.
3. **Stage 3: Compilation & Linting Qualification**
   - Execute `npm run typecheck` across all 6 workspaces.
   - Execute `npm run lint`.
4. **Stage 4: Automated Test Validation**
   - Execute security regression suite: `npm run test:security` (15/15 required).
   - Execute full workspace test suite: `npm test` (all 139 tests required).
5. **Stage 5: Packaging & Runtime Smoke Testing**
   - Package Linux x64 staging artifact via `npm run package:desktop`.
   - Execute headless smoke test (`ELECTRON_RUN_AS_NODE=1 ./openagent-desktop -e "..."`).
   - Perform GUI launch test on X11 and Wayland environments.
6. **Stage 6: Artifact Staging & SBOM Generation**
   - Generate updated CycloneDX 1.5 and SPDX 2.3 SBOMs.
   - Stage build artifact under `release/staging/` with independent SHA-256 manifest.

---

## 5. Acceptance Criteria for Release Gate

- Full `npm audit --omit=dev` remains at 0 vulnerabilities.
- Full `npm audit` shows clean resolution or reduction of upstream CVEs.
- 100% pass rate on monorepo test suite (139+ tests) and security regressions (15/15).
- Desktop startup latency benchmarks remain under 100 ms target.
- Deterministic build hashes verified across consecutive builds.

---

## 6. Monorepo & Platform Compatibility Matrix

| Environment Combination                            | Upstream Status | Dependency Install           | Typecheck & Lint    | Workspace Tests (139) | Security Suite (15) | Desktop Packaging  | Linux Smoke Test       | Evaluation Verdict                   |
| :------------------------------------------------- | :-------------- | :--------------------------- | :------------------ | :-------------------- | :------------------ | :----------------- | :--------------------- | :----------------------------------- |
| **Node 20.18 + Electron 30.5.1 (Linux x64)**       | Electron EOL    | **PASS**                     | **PASS** (0 errors) | **PASS** (139/139)    | **PASS** (15/15)    | **PASS**           | **PASS** (Operational) | **RC Baseline (Verified)**           |
| **Node 20.18 + Electron 30.5.1 (Windows x64)**     | Electron EOL    | Untested                     | **PASS** (Types)    | **NOT RUN**           | **NOT RUN**         | **NOT RUN**        | **NOT RUN**            | **NOT RUN (No CI Runner)**           |
| **Node 20.18 + Electron 30.5.1 (macOS arm64/x64)** | Electron EOL    | Untested                     | **PASS** (Types)    | **NOT RUN**           | **NOT RUN**         | **NOT RUN**        | **NOT RUN**            | **NOT RUN (No Notarization)**        |
| **Node 20.18 + Electron 41.10.7+ (All Platforms)** | Active LTS      | **FAIL** (`ERR_REQUIRE_ESM`) | N/A (Install crash) | N/A                   | N/A                 | N/A                | N/A                    | **BLOCKED (Requires Node >= 22.12)** |
| **Node 22.12+ + Electron 41.10.7+ (Linux x64)**    | Active LTS      | **PASS** (Compatible)        | **PASS** (Planned)  | **PASS** (Planned)    | **PASS** (Planned)  | **PASS** (Planned) | **PASS** (Planned)     | **Target for v0.2.0**                |

---

## 7. Security Remediation Acceptance Criteria

Every dependency advisory must be verified against concrete removal or upstream patch criteria:

1. **`GHSA-jmr9-qjv8-65gv` & `GHSA-7pqw-9j4j-h8q3` (`extract-zip@2.0.1`)**:
   - **Target**: `@electron-internal/extract-zip@1.0.5`.
   - **Verification**: `npm ls extract-zip` returns 0 entries. Zero zip extraction vulnerabilities reported by `npm audit`.
2. **`GHSA-hp3w-g68c-fv3c` (`sprintf-js@1.1.3` via `roarr` / `global-agent`)**:
   - **Target**: `@electron/get@5.1.0` (switches to `undici` HTTP fetch, removing legacy proxy loggers).
   - **Verification**: `npm ls sprintf-js roarr global-agent` returns 0 entries across entire lockfile.
3. **`GHSA-vmqv-hx8q-j7mg` & Electron Core Advisories (`electron@30.5.1`)**:
   - **Target**: `electron@41.10.7+` / `electron@44.7.0`.
   - **Verification**: Upstream Chromium engine `>= 141`, `npm audit` reports 0 vulnerabilities for `electron`.

---

## 8. Rollback & Recovery Procedures

If unexpected regressions occur during the v0.2.0 migration implementation:

1. **Toolchain Reversion**: Revert `apps/desktop/package.json` to `electron: ^30.0.0` and restore `package-lock.json`.
2. **Engine Baseline Reversion**: Revert root `package.json` engines to `"node": ">=20.0.0"`.
3. **Verification**: Re-run `npm ci`, `npm run typecheck`, and `npm test` to verify restored 139 passing test baseline.
4. **Historical Isolation**: The `v0.1.0-rc1` release candidate files under `release/desktop/` remain immutable and are never overwritten during migration.
