# Installation Guide

## 1. System Requirements

- **Linux**: x86_64, glibc 2.28+ (Ubuntu 20.04+, Debian 11+, Fedora 34+, Arch Linux) — **Verified**.
- **Windows / macOS**: Currently untested in CI (pending platform-native runners); build from source supported.
- **Memory**: Minimum 4 GB RAM (8 GB recommended for local vector embeddings).
- **Disk Space**: 500 MB free storage for binaries and local knowledge databases.

## 2. Linux Installation (Verified Release Candidate)

### Option A: Binary Tarball (Recommended)

1. Verify package integrity:
   ```bash
   sha256sum -c openagent-desktop-linux-x64.tar.gz.sha256
   ```
2. Unpack the release archive:
   ```bash
   tar -xzf openagent-desktop-linux-x64.tar.gz
   cd openagent-desktop
   ```
3. Run the application:
   ```bash
   ./launch-openagent.sh
   ```
4. Optional: Install system shortcut:
   ```bash
   cp openagent.desktop ~/.local/share/applications/
   ```

### Option B: Standalone Directory

Run directly from any directory:

```bash
./openagent-desktop
```

## 3. Development Installation from Source

1. Clone the repository:
   ```bash
   git clone https://github.com/open-agent/open-agent-infrastructure.git
   cd open-agent-infrastructure
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the core workspaces and desktop application:
   ```bash
   npm run build
   ```
4. Start in development mode:
   ```bash
   npm start --workspace=@open-agent/desktop
   ```
