import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "../..");

console.log("[PACKAGING] Starting OpenAgent Desktop Packaging Workflow...");

// 1. Build desktop codebase
console.log("[PACKAGING] Compiling TypeScript...");
execSync("npx tsc -p tsconfig.json", { cwd: desktopRoot, stdio: "inherit" });

// 2. Prepare release directory
const releaseDir = path.join(desktopRoot, "release");
const appDir = path.join(releaseDir, "openagent-desktop");
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });

// 3. Copy Electron binaries
const electronDist = path.join(repoRoot, "node_modules", "electron", "dist");
if (!fs.existsSync(electronDist)) {
  throw new Error(`Electron distribution not found at: ${electronDist}`);
}
console.log(`[PACKAGING] Copying Electron binaries from ${electronDist}...`);
fs.cpSync(electronDist, appDir, { recursive: true });

// Rename electron executable
const electronBinary = path.join(appDir, "electron");
const openagentBinary = path.join(appDir, "openagent-desktop");
if (fs.existsSync(electronBinary)) {
  fs.renameSync(electronBinary, openagentBinary);
  fs.chmodSync(openagentBinary, 0o755);
}

// 4. Populate resources/app
const resourcesAppDir = path.join(appDir, "resources", "app");
fs.mkdirSync(resourcesAppDir, { recursive: true });

// Copy package.json
fs.copyFileSync(path.join(desktopRoot, "package.json"), path.join(resourcesAppDir, "package.json"));

// Copy dist (compiled main, preload, types)
fs.cpSync(path.join(desktopRoot, "dist"), path.join(resourcesAppDir, "dist"), { recursive: true });

// Copy renderer
fs.cpSync(
  path.join(desktopRoot, "src", "renderer"),
  path.join(resourcesAppDir, "src", "renderer"),
  {
    recursive: true,
  }
);

// Copy workspace dependencies and node_modules
const appNodeModules = path.join(resourcesAppDir, "node_modules");
fs.mkdirSync(appNodeModules, { recursive: true });

// Copy @open-agent packages
const openAgentScope = path.join(appNodeModules, "@open-agent");
fs.mkdirSync(openAgentScope, { recursive: true });

const packages = ["core", "vector", "graph", "network"];
for (const pkg of packages) {
  const pkgSrc = path.join(repoRoot, "packages", pkg);
  const pkgDest = path.join(openAgentScope, pkg);
  fs.mkdirSync(pkgDest, { recursive: true });
  fs.copyFileSync(path.join(pkgSrc, "package.json"), path.join(pkgDest, "package.json"));
  fs.cpSync(path.join(pkgSrc, "dist"), path.join(pkgDest, "dist"), { recursive: true });
}

// 5. Create Desktop Entry & Launch Script
const desktopEntryContent = `[Desktop Entry]
Name=OpenAgent Infrastructure
Comment=Local AI Agent Infrastructure Desktop Platform
Exec=openagent-desktop
Icon=utilities-terminal
Terminal=false
Type=Application
Categories=Development;Science;IDE;
StartupWMClass=openagent-desktop
`;
fs.writeFileSync(path.join(appDir, "openagent.desktop"), desktopEntryContent, "utf-8");

const launcherScriptContent = `#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
export OPENAGENT_DESKTOP_DATA_DIR="\${OPENAGENT_DESKTOP_DATA_DIR:-$HOME/.config/openagent}"
exec "\$SCRIPT_DIR/openagent-desktop" "$@"
`;
const launcherPath = path.join(appDir, "launch-openagent.sh");
fs.writeFileSync(launcherPath, launcherScriptContent, "utf-8");
fs.chmodSync(launcherPath, 0o755);

// 6. Create Tarball Artifact
console.log("[PACKAGING] Creating release tarball: openagent-desktop-linux-x64.tar.gz...");
const tarballName = "openagent-desktop-linux-x64.tar.gz";
const tarballPath = path.join(releaseDir, tarballName);
execSync(`tar -czf "${tarballPath}" -C "${releaseDir}" openagent-desktop`, { stdio: "inherit" });

// 7. Generate SHA-256 Checksum
const tarballBuffer = fs.readFileSync(tarballPath);
const checksum = createHash("sha256").update(tarballBuffer).digest("hex");
const checksumPath = `${tarballPath}.sha256`;
fs.writeFileSync(checksumPath, `${checksum}  ${tarballName}\n`, "utf-8");

console.log(`[PACKAGING SUCCESS] Release Artifacts Produced:`);
console.log(` - App Directory: ${appDir}`);
console.log(
  ` - Archive:      ${tarballPath} (${(tarballBuffer.length / (1024 * 1024)).toFixed(2)} MB)`
);
console.log(` - SHA-256:      ${checksum}`);

// 8. Self-Verification
console.log("[PACKAGING] Verifying packaged binary...");
const testVersionOutput = execSync(
  `"${openagentBinary}" -e "console.log('OpenAgent Packaged Runtime Verified: ' + process.versions.electron)"`,
  {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf-8",
  }
).trim();
console.log(`[VERIFIED] ${testVersionOutput}`);
