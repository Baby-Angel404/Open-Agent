# OpenAgent Infrastructure — Linux x64 Distribution & Installation Guide

> **Release Scope**: Linux x86_64 (`x64`) Only.  
> **Target Version**: `0.2.0-alpha.1` (Alpha Pre-release — Testing & Evaluation Only; Not for Production)  
> **Security Notice**: Do NOT extract untrusted archives or execute downloaded binaries without verifying SHA-256 provenance and checksums. Never run OpenAgent Desktop as `root` or with `sudo`.

---

## 1. Supported Architecture and Tested Runtime Requirements

- **Architecture**: Linux `x86_64` (`x64`) exclusively.
- **Operating System / C Runtime**: Linux distributions with `glibc 2.28+` (Ubuntu 20.04+, Debian 11+, Fedora 34+, Arch Linux, CentOS Stream 9+).
- **Display Server**: X11 or Wayland (XWayland supported; native Wayland via `--ozone-platform=wayland`).
- **Hardware Requirements**:
  - Minimum 4 GB RAM (8 GB RAM recommended for local vector embeddings and Graph RAG).
  - 500 MB free disk space for runtime binaries, application resources, and local knowledge databases.
- **Privilege Level**: Standard unprivileged user account. Root or superuser privileges are strictly not required and discouraged.

---

## 2. Downloaded Archive Identification & Multi-Layer Integrity Verification

Official distribution files and verification layers:

- **Archive**: `openagent-desktop-linux-x64.tar.gz` (or versioned `openagent-desktop-0.2.0-alpha.1-linux-x64.tar.gz`)
- **Checksum Manifest**: `SHA256SUMS` (or `checksums.txt`)
- **Cosign Signature Bundle**: `openagent-desktop-linux-x64.tar.gz.bundle`
- **Historical Alpha.1 SHA-256 Digest**:
  ```
  0844f90814ddd61de9b61490906ce022e1f559348a1195338e7bab9356639f09  openagent-desktop-0.2.0-alpha.1-linux-x64.tar.gz
  ```

> **Historical Reference Notice**:
>
> - `v0.1.0-rc1`: archive `openagent-desktop-linux-x64.tar.gz` (`0fa12457faaf239e1fb5528b906de265d0799301b86e2763e30c100069fca7c4`) preserved in `release/desktop/`.
> - `0.2.0-alpha.1`: archive `openagent-desktop-0.2.0-alpha.1-linux-x64.tar.gz` (`0844f908...`) preserved in `release/staging/`. Note: alpha.1 was packaged locally prior to CI supply-chain hardening and carries checksums only (no SLSA attestation or Cosign bundle).
> - `v0.2.0-alpha.2+`: full three-layer verification (Checksum + SLSA Provenance + Cosign Signature) produced automatically by GitHub Actions.

---

### Understanding the Three Trust Layers

| Layer                    | Verification Tool        | What It Guarantees                                                                                                                       | What It Does NOT Guarantee                                             |
| :----------------------- | :----------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------- |
| **1. SHA-256 Checksum**  | `sha256sum`              | **Transport Integrity**: The downloaded file matches the hash published in `SHA256SUMS`.                                                 | Does not prove WHO authored or published the hash.                     |
| **2. Sigstore / Cosign** | `cosign` (2.x+)          | **Publisher Identity**: The file was cryptographically signed by the official GitHub Actions workflow for the exact repository and tag.  | Does not record the internal build steps or inputs.                    |
| **3. SLSA Provenance**   | `gh attestation` (2.49+) | **Build Authenticity**: Cryptographic in-toto proof that GitHub Actions runner built this exact binary from the specified source commit. | Does not guarantee absence of zero-day vulnerabilities in source code. |

---

### Verification Procedures

#### Step 2.1: Verify SHA-256 Checksum

```bash
# Verify using published SHA256SUMS manifest
sha256sum -c SHA256SUMS

# Or verify single alpha.1 candidate directly
echo "0844f90814ddd61de9b61490906ce022e1f559348a1195338e7bab9356639f09  openagent-desktop-0.2.0-alpha.1-linux-x64.tar.gz" | sha256sum -c -
```

_Expected output_: `...: OK`. If verification fails, stop immediately.

#### Step 2.2: Verify GitHub Artifact Attestation (SLSA Provenance)

Prerequisites: GitHub CLI `gh` 2.49.0+ installed (`gh --version`).

```bash
gh attestation verify openagent-desktop-linux-x64.tar.gz \
  --repo Baby-Angel404/Open-Agent
```

_Expected verification properties_:

- **Repository**: `Baby-Angel404/Open-Agent`
- **Signer**: `GitHub Actions` (`https://token.actions.githubusercontent.com`)
- **Workflow**: `.github/workflows/release.yml`

#### Step 2.3: Verify Sigstore / Cosign Keyless Signature

Prerequisites: Sigstore `cosign` 2.x+ installed (`cosign version`).

```bash
cosign verify-blob openagent-desktop-linux-x64.tar.gz \
  --bundle openagent-desktop-linux-x64.tar.gz.bundle \
  --certificate-identity-regexp "^https://github.com/Baby-Angel404/Open-Agent/.github/workflows/release.yml@refs/tags/v.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

_Expected output_: `Verified OK`.

---

### Common Verification Failures and Remediation

1. **`FAILED (checksum did not match)`**: The archive was corrupted or tampered with in transit. Delete the file immediately and re-download from GitHub Releases.
2. **`certificate identity mismatch`**: The Cosign signature was minted by an unauthorized repository, workflow, or branch. Do NOT execute the binary.
3. **`no matching attestations found`**: The binary does not have an authentic SLSA provenance record in the GitHub Attestation API for repository `Baby-Angel404/Open-Agent`. Treat the binary as untrusted.

---

## 3. Safe Non-Privileged Extraction

Extract the archive into a dedicated user-owned directory (e.g. `~/opt/openagent` or `~/.local/share/openagent`):

```bash
mkdir -p ~/opt/openagent
tar -xzf openagent-desktop-0.2.0-alpha.1-linux-x64.tar.gz -C ~/opt/openagent
cd ~/opt/openagent/openagent-desktop
```

---

## 4. Executable Permissions Verification

The packaging script provisions standard executable permissions (`0755` / `-rwxr-xr-x`). Confirm or apply them:

```bash
chmod 0755 openagent-desktop launch-openagent.sh
```

---

## 5. Runtime Health Check and Self-Test

Before launching the full desktop graphical interface, run the headless runtime self-test:

```bash
ELECTRON_RUN_AS_NODE=1 ./openagent-desktop -e "console.log('OpenAgent Runtime Self-Test: OK [Node ' + process.versions.node + ', Electron ' + process.versions.electron + ']')"
```

_Expected output_:

```
OpenAgent Runtime Self-Test: OK [Node 24.18.0, Electron 41.10.7]
```

---

## 6. Initial Configuration and Startup

### Environment Variables

- `OPENAGENT_DESKTOP_DATA_DIR`: Base directory for application databases and audit trails (defaults to `~/.config/openagent`).
- `OPENAGENT_VAULT_KEY`: Optional 256-bit passphrase for local AES-256-GCM Credential Vault. If unset, machine-isolated fallback key derivation applies.

### Launching the Application

Execute the bundled launcher script:

```bash
./launch-openagent.sh
```

Or execute directly:

```bash
./openagent-desktop
```

### Optional: Desktop Integration

To register the application in your desktop application menu:

```bash
sed -i "s|Exec=openagent-desktop|Exec=$HOME/opt/openagent/openagent-desktop/launch-openagent.sh|" openagent.desktop
cp openagent.desktop ~/.local/share/applications/
update-desktop-database ~/.local/share/applications/ 2>/dev/null || true
```

---

## 7. Troubleshooting Common Linux Issues

- **Wayland blank screen or GPU glitch**:
  Launch with explicit ozone platform:
  ```bash
  ./openagent-desktop --ozone-platform=wayland
  ```
  Or force X11 compatibility:
  ```bash
  GDK_BACKEND=x11 ./openagent-desktop
  ```
- **Port Conflict (EADDRINUSE)**:
  OpenAgent Desktop allocates an ephemeral port (`port: 0`) for its internal loopback HTTP gateway, preventing fixed-port collisions automatically. If P2P network transport conflicts, change the network port in settings.
- **Missing system libraries**:
  Ensure standard graphical dependencies are installed on minimal Linux distributions: `libgtk-3-0`, `libnss3`, `libasound2`, `libdrm2`, `libgbm1`.

---

## 8. Uninstallation and Cleanup

OpenAgent installs entirely in user space without system-wide file modifications. To completely remove:

1. Stop any running instances of OpenAgent.
2. Remove desktop application files:
   ```bash
   rm -rf ~/opt/openagent
   rm -f ~/.local/share/applications/openagent.desktop
   ```
3. (Optional) Back up and remove local user data and configuration:
   ```bash
   # Back up first if needed:
   # tar -czf ~/openagent-data-backup.tar.gz -C ~/.config openagent
   rm -rf ~/.config/openagent
   ```

---

## 9. Known Limitations and Residual Security Risks

1. **Platform Scope**: Linux x64 (`x86_64`) is the only verified binary distribution. Windows and macOS binary builds are **UNTESTED (NOT RUN)**.
2. **Toolchain Modernization & Security Status**: In `0.2.0-alpha.1`, toolchain upgrades to Node.js 22 LTS and Electron 41 Modern LTS eliminated legacy advisories (`npm audit` reports 0 vulnerabilities). Defense-in-depth controls (`contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer) remain strictly enforced. Legacy `v0.1.0-rc1` toolchain findings remain documented in [findings.md](../security-audit/findings.md) for historical provenance only.
3. **Cryptographic Signatures & Attestations**: Binary signature attestations (Cosign / SLSA Provenance / Minisign) are not yet integrated into the automated release pipeline; SHA-256 digest verification is currently mandatory.
4. **Pre-Release Alpha Status**: Version `0.2.0-alpha.1` is strictly designated for controlled testing, evaluation, and early adopters. It is not approved for production-critical environments.
5. **No Automatic Background Updates**: OpenAgent does not implement unprompted auto-updates. Updates must be verified and installed manually by the user.
