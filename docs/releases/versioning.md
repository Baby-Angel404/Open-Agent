# Versioning Policy

OpenAgent Infrastructure adheres strictly to [Semantic Versioning 2.0.0](https://semver.org/).

## Version Format: `MAJOR.MINOR.PATCH`

1. **MAJOR (`X.0.0`)**: Incremented when incompatible API, IPC channel, or policy schema changes are introduced.
2. **MINOR (`0.X.0`)**: Incremented when new backward-compatible capabilities, transports, or storage backends are added.
3. **PATCH (`0.0.X`)**: Incremented for backward-compatible bug fixes, security remediations, and performance improvements.

## Subsystem & Protocol Versioning

In addition to the repository package version, individual protocols and serialization formats maintain internal schema versions:

- **Audit Log Format**: `1.0.0` — Monotonic sequence numbers and continuous SHA-256 hash chains.
- **Network Protocol**: `1.0.0` — Canonical JSON payload serialization with Ed25519 digital signatures.
- **Storage Backend Schema**: `1.0.0` — Validated manifest and collection records.
- **Backup Archive Format**: `1.0.0` — Manifest with SHA-256 integrity trees.

Schema version mismatches fail closed to protect data integrity across upgrades.
