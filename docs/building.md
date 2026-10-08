# Building from Source & Packaging Guide

## 1. Prerequisites

- **Node.js**: v20.0.0 or higher.
- **npm**: v10.0.0 or higher.
- **Git**: v2.30 or higher.
- **Tar** & standard archive utilities.

## 2. Monorepo Build Commands

Build all packages and applications in dependency order:

```bash
# Build all workspaces (vector, graph, network, core, cli, desktop)
npm run build

# Type check all workspaces
npm run typecheck

# Run full test suite across all 49+ suites
npm test
```

## 3. Desktop Packaging Workflow

To generate a standalone, distributable release package on your host OS:

```bash
npm run package:desktop
```

This automated pipeline:

1. Compiles all TypeScript files into `apps/desktop/dist/`.
2. Packages runtime assets, HTML/CSS, preload scripts, and linked `@open-agent` packages into `apps/desktop/release/openagent-desktop/`.
3. Creates a `.desktop` Linux desktop entry and startup script `launch-openagent.sh`.
4. Creates a compressed distribution tarball: `openagent-desktop-linux-x64.tar.gz`.
5. Computes and saves the SHA-256 checksum: `openagent-desktop-linux-x64.tar.gz.sha256`.
6. Executes self-verification on the packaged executable.

## 4. Environment Variables for Customization

- `OPENAGENT_DESKTOP_DATA_DIR`: Custom directory to store data, vault, and audit logs.
- `OPENAGENT_VAULT_KEY`: Optional custom master passphrase for CredentialVault derivation.
- `PORT`: Optional fixed port for the loopback API server (defaults to 0 for auto-assigned ephemeral port).
