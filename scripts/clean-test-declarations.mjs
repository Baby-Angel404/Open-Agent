import fs from "node:fs";
import path from "node:path";

const workspaces = [
  "packages/vector",
  "packages/graph",
  "packages/core",
  "packages/network",
  "apps/cli",
  "apps/desktop",
];

for (const ws of workspaces) {
  const testsDistDir = path.resolve(ws, "dist", "tests");
  if (fs.existsSync(testsDistDir)) {
    const files = fs.readdirSync(testsDistDir);
    for (const file of files) {
      if (file.includes(".d.ts")) {
        fs.unlinkSync(path.join(testsDistDir, file));
      }
    }
  }
}
