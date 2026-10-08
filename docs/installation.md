# Installation Guide

## 1. System Requirements

- **Linux**: x86_64, glibc 2.28+ (Ubuntu 20.04+, Debian 11+, Fedora 34+, Arch Linux).
- **Windows**: Windows 10/11 64-bit.
- **macOS**: macOS 12+ (Intel & Apple Silicon).
- **Memory**: Minimum 4 GB RAM (8 GB recommended for local vector embeddings).
- **Disk Space**: 500 MB free storage for binaries and local knowledge databases.

## 2. Linux Installation

### Option A: Binary Tarball (Recommended)

1. Download the release archive:
   ```bash
   tar -xzf openagent-desktop-linux-x64.tar.gz
   cd openagent-desktop
   ```
2. Run the application:
   ```bash
   ./launch-openagent.sh
   ```
3. Optional: Install system shortcut:
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
