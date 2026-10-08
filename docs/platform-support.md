# Platform Support & Target Matrix

## 1. Operating System Compatibility Matrix

| Platform    | Architecture          | Tier   | Status          | Packaging Format                      | Notes                                                                |
| ----------- | --------------------- | ------ | --------------- | ------------------------------------- | -------------------------------------------------------------------- |
| **Linux**   | x86_64                | Tier 1 | Fully Supported | Standalone dir, `.tar.gz`, `.desktop` | Built and verified on host environment. Supports both X11 & Wayland. |
| **Linux**   | ARM64                 | Tier 2 | Supported       | Standalone dir, `.tar.gz`             | Cross-compilation supported via Node/Electron.                       |
| **Windows** | x64 (10/11)           | Tier 1 | Fully Supported | Standalone dir, portable zip          | Full feature parity across IPC, vault, and networking.               |
| **macOS**   | Apple Silicon (arm64) | Tier 1 | Fully Supported | Standalone dir, `.dmg`                | Native arm64 binaries supported.                                     |
| **macOS**   | Intel (x64)           | Tier 2 | Supported       | Standalone dir, `.dmg`                | macOS 12 Monterey or newer required.                                 |

## 2. Hardware Acceleration & Headless Support

- **GUI Mode**: Requires graphical display server (X11, Wayland, Windows DWM, macOS Quartz).
- **Headless Mode**: The core engine and CLI (`openagent`) can be run in fully headless server or container environments without Electron or display dependencies.
