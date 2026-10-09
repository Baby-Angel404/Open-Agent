# OpenAgent Infrastructure — Rollback & Incident Readiness Checklist

> **Purpose**: Standard operational checklist for rolling back a release, reverting installation files safely, and handling compromised or defective distributions.  
> **Rule**: User data must NOT be deleted automatically. Every step must be reversible and preserve evidence.

---

## 1. Rollback Checklist

### Step 1: Identify Current Distribution and Revision
* Record currently installed archive filename and checksum:
  ```bash
  sha256sum openagent-desktop-linux-x64.tar.gz
  ```
* Record running revision and commit metadata (if built from source or tagged):
  ```bash
  # Example: v0.1.0-rc1 (Commit: ca32fcc5dcbb64be3d910ca6ac26474ad581ba4f)
  ```

### Step 2: Preserve Checksum Manifests and Diagnostic Logs
* Copy current manifest and diagnostic logs to a quarantine/inspection directory:
  ```bash
  mkdir -p ~/openagent-incident-archive
  cp checksums.txt ~/openagent-incident-archive/
  cp -r ~/.config/openagent/data/audit ~/openagent-incident-archive/audit-logs-$(date +%Y%m%d%H%M%S)
  ```

### Step 3: Stop Running Application Safely
* Terminate any active OpenAgent processes cleanly:
  ```bash
  pkill -TERM openagent-desktop || true
  # Verify all processes exited:
  pgrep -l openagent || echo "All OpenAgent processes stopped."
  ```

### Step 4: Back Up User Configuration and Knowledge Data
* Create a full manual snapshot of user application data before touching binaries:
  ```bash
  tar -czf ~/openagent-user-data-backup-$(date +%Y%m%d%H%M%S).tar.gz -C ~/.config openagent
  ```

### Step 5: Replace / Restore Previously Validated Binary Artifact
* Remove defective extracted directory (do NOT touch `~/.config/openagent`):
  ```bash
  rm -rf ~/opt/openagent/openagent-desktop
  ```
* Re-extract the known-good validated archive (e.g., previous verified backup or candidate):
  ```bash
  tar -xzf <previous-verified-archive>.tar.gz -C ~/opt/openagent
  chmod 0755 ~/opt/openagent/openagent-desktop/openagent-desktop
  chmod 0755 ~/opt/openagent/openagent-desktop/launch-openagent.sh
  ```

### Step 6: Verify the Restored Installation
* Execute runtime self-test:
  ```bash
  ELECTRON_RUN_AS_NODE=1 ~/opt/openagent/openagent-desktop/openagent-desktop -e "console.log('Restored runtime verified:', process.versions)"
  ```
* Launch desktop application and verify data integrity via **Settings -> Backup, Verification & Restore -> Verify Checksum**.

---

## 2. Suspected Security Incident or Compromised Distribution Handling

If an artifact checksum mismatch, unauthorized tampering, or malicious activity is suspected:

1. **Isolate Workstation**: Disconnect network interface or isolate from local network peers.
2. **Preserve Forensic Evidence**:
   * Do NOT delete downloaded archives, logs, or modified files.
   * Calculate SHA-256 digests and freeze directory attributes:
     ```bash
     ls -lan ~/opt/openagent > ~/openagent-incident-archive/file-attributes.txt
     find ~/opt/openagent -type f -exec sha256sum {} + > ~/openagent-incident-archive/installed-hashes.txt
     ```
3. **Report Defective or Compromised Distribution**:
   * Email maintainers according to [SECURITY.md](../../SECURITY.md) guidelines with exact file hashes, download source URL, and timestamp.
   * If using Git repository remotes, record current commit (`git rev-parse HEAD`) and remote tracking URL (`git remote -v`).
