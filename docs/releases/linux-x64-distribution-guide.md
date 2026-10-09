# OpenAgent Infrastructure — Linux x64 Distribution & Installation Guide

> **Release Scope**: Linux x86_64 (`x64`) Only.  
> **Target Version**: `v0.1.0-rc1`  
> **Security Notice**: Do NOT extract untrusted archives or execute downloaded binaries without verifying SHA-256 provenance and checksums. Never run OpenAgent Desktop as `root` or with `sudo`.

---

## 1. Supported Architecture and Tested Runtime Requirements

* **Architecture**: Linux `x86_64` (`x64`) exclusively.
* **Operating System / C Runtime**: Linux distributions with `glibc 2.28+` (Ubuntu 20.04+, Debian 11+, Fedora 34+, Arch Linux, CentOS Stream 9+).
* **Display Server**: X11 or Wayland (XWayland supported; native Wayland via `--ozone-platform=wayland`).
* **Hardware Requirements**:
  * Minimum 4 GB RAM (8 GB RAM recommended for local vector embeddings and Graph RAG).
  * 500 MB free disk space for runtime binaries, application resources, and local knowledge databases.
* **Privilege Level**: Standard unprivileged user account. Root or superuser privileges are strictly not required and discouraged.

---

## 2. Downloaded Archive Identification & Integrity Verification

Official release candidate distribution files:

* **Archive**: `openagent-desktop-linux-x64.tar.gz` (or versioned alias `openagent-desktop-0.1.0-linux-x64.tar.gz`)
* **Checksum Manifest**: `checksums.txt`
* **Recorded SHA-256 Digest**:
  ```
  0fa12457faaf239e1fb5528b906de265d0799301b86e2763e30c100069fca7c4  openagent-desktop-linux-x64.tar.gz
  ```

### Step 1: Verify Checksum Before Extraction

Verify the integrity against the authentic, trusted project channel digest:

```bash
echo "0fa12457faaf239e1fb5528b906de265d0799301b86e2763e30c100069fca7c4  openagent-desktop-linux-x64.tar.gz" | sha256sum -c -
```

*Expected output*: `openagent-desktop-linux-x64.tar.gz: OK`.  
If verification fails, do NOT extract the archive. Discard the file immediately.

---

## 3. Safe Non-Privileged Extraction

Extract the archive into a dedicated user-owned directory (e.g. `~/opt/openagent` or `~/.local/share/openagent`):

```bash
mkdir -p ~/opt/openagent
tar -xzf openagent-desktop-linux-x64.tar.gz -C ~/opt/openagent
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

*Expected output*:
```
OpenAgent Runtime Self-Test: OK [Node 20.16.0, Electron 30.5.1]
```

---

## 6. Initial Configuration and Startup

### Environment Variables
* `OPENAGENT_DESKTOP_DATA_DIR`: Base directory for application databases and audit trails (defaults to `~/.config/openagent`).
* `OPENAGENT_VAULT_KEY`: Optional 256-bit passphrase for local AES-256-GCM Credential Vault. If unset, machine-isolated fallback key derivation applies.

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

* **Wayland blank screen or GPU glitch**:
  Launch with explicit ozone platform:
  ```bash
  ./openagent-desktop --ozone-platform=wayland
  ```
  Or force X11 compatibility:
  ```bash
  GDK_BACKEND=x11 ./openagent-desktop
  ```
* **Port Conflict (EADDRINUSE)**:
  OpenAgent Desktop allocates an ephemeral port (`port: 0`) for its internal loopback HTTP gateway, preventing fixed-port collisions automatically. If P2P network transport conflicts, change the network port in settings.
* **Missing system libraries**:
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
2. **Toolchain Advisories**: Development dependencies contain 6 documented security advisories in the Electron toolchain (including `extract-zip` and upstream `electron`). These are mitigated by strict compensating controls (no ASAR packaging, `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer, zero runtime zip extraction). See [findings.md](../security-audit/findings.md).
3. **No Automatic Background Updates**: OpenAgent does not implement unprompted auto-updates. Updates must be verified and installed manually by the user.
