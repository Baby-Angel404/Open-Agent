# Development Guide

This guide describes local setup, build cycles, and test execution for OpenAgent Infrastructure.

---

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Git >= 2.x

---

## Local Environment Setup

Clone repository and install workspace dependencies:

```bash
git clone <repo-url> open-agent-infrastructure
cd open-agent-infrastructure
npm install
```

---

## Development Workflows

### 1. Building Packages

Compile all TypeScript packages (`packages/core` and `apps/cli`):

```bash
npm run build
```

### 2. Running Test Suites

Run all automated test suites using the native Node.js test runner:

```bash
npm run test
```

### 3. Type Checking

Perform strict TypeScript compiler validation without emitting files:

```bash
npm run typecheck
```

### 4. Code Formatting

Check or auto-format code across the monorepo:

```bash
npm run format:check
npm run format
```

### 5. Running the CLI Locally

After running `npm run build`:

```bash
node apps/cli/dist/bin/openagent.js agent status
node apps/cli/dist/bin/openagent.js policy list
```
