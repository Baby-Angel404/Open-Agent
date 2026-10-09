# Platform Support & Target Matrix

## 1. Operating System Compatibility Matrix

| Platform    | Architecture          | Tier   | Status                  | Packaging Format                      | Notes                                                                                |
| ----------- | --------------------- | ------ | ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| **Linux**   | x86_64                | Tier 1 | **Verified (RC Ready)** | Standalone dir, `.tar.gz`, `.desktop` | Built, benchmarked, and validated on Linux host (Kernel 7.2+). Supports X11/Wayland. |
| **Linux**   | ARM64                 | Tier 2 | Planned                 | Standalone dir, `.tar.gz`             | Node/Electron supported; awaiting dedicated ARM64 test runner.                       |
| **Windows** | x64 (10/11)           | Tier 3 | **Untested (NOT RUN)**  | Standalone dir, portable zip          | Architecture portable, but unverified on Windows host. Blocked on Windows CI.        |
| **macOS**   | Apple Silicon (arm64) | Tier 3 | **Untested (NOT RUN)**  | Standalone dir, `.dmg`                | Designed for macOS 12+, but unverified. Blocked on macOS runner and notarization.    |
| **macOS**   | Intel (x64)           | Tier 3 | **Untested (NOT RUN)**  | Standalone dir, `.dmg`                | Unverified on physical hardware. Blocked on macOS CI runner.                         |

## 2. Hardware Acceleration & Headless Support

- **GUI Mode**: Requires graphical display server (X11, Wayland, Windows DWM, macOS Quartz).
- **Headless Mode**: The core engine and CLI (`openagent`) can be run in fully headless server or container environments without Electron or display dependencies.
