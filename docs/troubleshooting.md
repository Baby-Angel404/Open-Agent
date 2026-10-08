# Troubleshooting & Diagnostic Guide

## 1. Common Issues & Resolutions

### Port Collision / EADDRINUSE

- **Symptom**: Error indicating loopback port or network transport port is already in use.
- **Cause**: Another instance of OpenAgent or another local service is listening on port 4200.
- **Resolution**:
  - OpenAgent Desktop uses `port: 0` for its internal HTTP gateway to eliminate port conflicts automatically.
  - For P2P network transport port, update `Settings -> Network -> Listen Port` to an alternative port (e.g. 4201).

### Permission Denied on Launch

- **Symptom**: `launch-openagent.sh: Permission denied` or `openagent-desktop: Permission denied`.
- **Resolution**:
  ```bash
  chmod +x apps/desktop/release/openagent-desktop/launch-openagent.sh
  chmod +x apps/desktop/release/openagent-desktop/openagent-desktop
  ```

### Wayland vs X11 Display Issues

- **Symptom**: Blank window or graphics driver warning on Linux Wayland compositors.
- **Resolution**:
  Launch with Wayland flags or fallback to X11 compatibility mode:
  ```bash
  ./openagent-desktop --ozone-platform=wayland
  # or
  GDK_BACKEND=x11 ./openagent-desktop
  ```

### Backup Verification Failure

- **Symptom**: `Backup verification failed: Checksum mismatch`.
- **Cause**: The backup `.json` file was edited or corrupted during transfer.
- **Resolution**: Do not manually modify backup archives. Use uncompressed JSON transfer or re-export from the source desktop instance.

## 2. Viewing Diagnostic Logs

- Local data path: `~/.config/openagent/` (or `~/.config/@open-agent/desktop/`).
- Audit log entries: `~/.config/openagent/data/audit/audit.jsonl`.
- Verify audit integrity directly via CLI:
  ```bash
  npx openagent audit verify
  ```
