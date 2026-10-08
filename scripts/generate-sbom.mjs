#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function computeFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function getWorkspaces() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
  const workspaceDirs = [];

  for (const pattern of rootPkg.workspaces || []) {
    const baseDir = pattern.replace(/\/\*$/, "");
    const fullBase = path.join(rootDir, baseDir);
    if (fs.existsSync(fullBase)) {
      const entries = fs.readdirSync(fullBase, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pkgPath = path.join(fullBase, entry.name, "package.json");
          if (fs.existsSync(pkgPath)) {
            workspaceDirs.push(path.join(fullBase, entry.name));
          }
        }
      }
    }
  }
  return workspaceDirs;
}

function generateCycloneDX() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
  const workspaces = getWorkspaces();
  const serialNumber = `urn:uuid:${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();

  const components = [];

  for (const wsDir of workspaces) {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(wsDir, "package.json"), "utf-8"));
    const relDir = path.relative(rootDir, wsDir);

    const comp = {
      type: "application",
      "bom-ref": `pkg:npm/${pkgJson.name}@${pkgJson.version}`,
      name: pkgJson.name,
      version: pkgJson.version,
      description: pkgJson.description || "",
      licenses: [
        {
          license: {
            id: pkgJson.license || "Apache-2.0",
          },
        },
      ],
      purl: `pkg:npm/${pkgJson.name}@${pkgJson.version}`,
      properties: [
        {
          name: "openagent:workspace-path",
          value: relDir,
        },
      ],
    };

    components.push(comp);
  }

  // Include top-level third-party production dependencies if present
  const lockfilePath = path.join(rootDir, "package-lock.json");
  if (fs.existsSync(lockfilePath)) {
    const lockfile = JSON.parse(fs.readFileSync(lockfilePath, "utf-8"));
    if (lockfile.packages) {
      for (const [depPath, depInfo] of Object.entries(lockfile.packages)) {
        if (!depPath.startsWith("node_modules/") || depInfo.dev) continue;
        const depName = depPath.replace(/^node_modules\//, "");
        if (depName.startsWith("@open-agent/")) continue; // already tracked

        components.push({
          type: "library",
          "bom-ref": `pkg:npm/${depName}@${depInfo.version}`,
          name: depName,
          version: depInfo.version,
          purl: `pkg:npm/${depName}@${depInfo.version}`,
          licenses: depInfo.license ? [{ license: { id: depInfo.license } }] : undefined,
          integrity: depInfo.integrity,
        });
      }
    }
  }

  const bom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber,
    version: 1,
    metadata: {
      timestamp,
      tools: {
        components: [
          {
            type: "application",
            name: "OpenAgent SBOM Generator",
            version: "1.0.0",
          },
        ],
      },
      component: {
        type: "application",
        "bom-ref": `pkg:npm/${rootPkg.name}@${rootPkg.version}`,
        name: rootPkg.name,
        version: rootPkg.version,
        description: rootPkg.description,
        licenses: [{ license: { id: rootPkg.license || "Apache-2.0" } }],
      },
    },
    components,
    dependencies: [
      {
        ref: `pkg:npm/${rootPkg.name}@${rootPkg.version}`,
        dependsOn: components.map((c) => c["bom-ref"]),
      },
    ],
  };

  const outputPath = path.join(rootDir, "sbom.cyclonedx.json");
  fs.writeFileSync(outputPath, JSON.stringify(bom, null, 2), "utf-8");
  console.log(`Generated CycloneDX SBOM at: ${outputPath} (${components.length} components)`);

  // Also produce SPDX 2.3 format
  const spdx = {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: rootPkg.name,
    documentNamespace: `https://github.com/openagent/openagent/spdx/${crypto.randomUUID()}`,
    creationInfo: {
      creators: ["Tool: OpenAgent SBOM Generator-1.0.0"],
      created: timestamp,
    },
    packages: [
      {
        name: rootPkg.name,
        SPDXID: "SPDXRef-RootPackage",
        versionInfo: rootPkg.version,
        downloadLocation: "NOASSERTION",
        filesAnalyzed: false,
        licenseConcluded: rootPkg.license || "Apache-2.0",
        licenseDeclared: rootPkg.license || "Apache-2.0",
      },
      ...components.map((c, idx) => ({
        name: c.name,
        SPDXID: `SPDXRef-Package-${idx + 1}`,
        versionInfo: c.version,
        downloadLocation: "NOASSERTION",
        filesAnalyzed: false,
        licenseConcluded: c.licenses?.[0]?.license?.id || "NOASSERTION",
        licenseDeclared: c.licenses?.[0]?.license?.id || "NOASSERTION",
      })),
    ],
  };

  const spdxOutputPath = path.join(rootDir, "sbom.spdx.json");
  fs.writeFileSync(spdxOutputPath, JSON.stringify(spdx, null, 2), "utf-8");
  console.log(`Generated SPDX 2.3 SBOM at: ${spdxOutputPath}`);
}

generateCycloneDX();
