# Releases & Update Strategy

## 1. Versioning Scheme

OpenAgent adheres strictly to [Semantic Versioning 2.0.0](https://semver.org/):

- **Major (X.0.0)**: Breaking changes to IPC schemas, policy engine evaluation semantics, or cryptographic audit algorithms.
- **Minor (0.X.0)**: New workspaces, additional executors, network capability extensions, or non-breaking protocol additions.
- **Patch (0.0.X)**: Security fixes, bug corrections, UI refinements, and performance improvements.

## 2. Release Channels

- **Stable**: Tagged releases tested across full integration suites. Recommended for production use.
- **Nightly / Development**: Automated builds from the `main` branch. Useful for testing experimental capability plugins.

## 3. Safe Update Procedures

1. **Pre-Update Backup**: Always create a full backup archive (`Settings -> Create Backup`) before updating major versions.
2. **Binary Replacement**: Extract the new release tarball over the installation directory.
3. **Database Migration**: All local database files (vector stores, knowledge graphs, audit logs) feature internal `version` headers and undergo automatic non-destructive migration on first startup.

## 4. Release Verification

Every release tarball is published with an accompanying `.sha256` hash:

```bash
sha256sum -c openagent-desktop-linux-x64.tar.gz.sha256
```

Ensure the output indicates `OK` before extracting.
