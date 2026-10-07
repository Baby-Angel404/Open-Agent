# Technology Decisions

This document records the foundational technology choices for OpenAgent Infrastructure, the rationale behind each selection, and the architectural boundaries enforced.

---

## Target Platforms

- **Linux** (x86_64, aarch64)
- **macOS** (Apple Silicon, Intel)
- **Windows** (x86_64)

---

## Stack Decisions

### 1. Monorepo Language & Core Runtime: TypeScript (Node.js >= 20)

- **Decision**: Use TypeScript with modern Node.js ECMAScript modules (ESM) and npm workspaces for Phase 0 core abstractions, policy engine, and CLI tooling.
- **Rationale**:
  - Unifies contract definitions between future browser extensions, desktop apps, and CLI tools without translation layers.
  - Native standard library support for cryptographic primitives (`node:crypto` / Web Crypto API `crypto.subtle`) enables identical audit hashing in both Node.js and browser environments.
  - Native test runner (`node:test`, `node:assert`) eliminates heavy testing dependencies (Jest, Mocha).
- **Alternatives Considered**:
  - _Pure Python_: Lacks seamless integration with WebExtension MV3 runtime.
  - _Rust-only for Phase 0_: High setup overhead for early developer experience and contract iteration, although Rust will be used for specific SIMD/embedded storage crates in Phase 1+.

### 2. Version Control & Packaging: Git + npm Workspaces

- **Decision**: Lightweight npm workspaces (`packages/*`, `apps/*`).
- **Rationale**: Built directly into Node.js/npm; requires zero external package manager installations (pnpm/yarn not guaranteed on target hosts). Avoids monolithic build lock-in.

### 3. Core Policy Evaluation: Pure In-Memory Deterministic Engine

- **Decision**: No external policy daemon (e.g. Open Policy Agent) for Phase 0. Built as a zero-dependency deterministic TypeScript library.
- **Rationale**:
  - Guarantees zero latency and eliminates IPC overhead during high-frequency agent actions.
  - Can be bundled directly into browser extension service workers where spawning separate daemons is prohibited.

### 4. Audit Trail: Local Append-Only Hash-Chained JSONL

- **Decision**: Use SHA-256 state chaining in local JSONL files (`.audit-logs/`).
- **Rationale**:
  - Provides tamper-evident verification similar to a blockchain ledger without distributed consensus overhead.
  - Zero external database dependencies required during bootstrap phase.

### 5. Future Component Alignment

- **Desktop/Frontend (Later Phase)**: Tauri + React + TypeScript (lightweight binary, web-native UI).
- **Core Vector/Graph Storage (Later Phase)**: Rust (memory safety, SIMD vector dot products, zero-copy columnar storage).
- **AI/ML Supporting Services (Later Phase)**: Python (only where ML frameworks provide a concrete advantage).
