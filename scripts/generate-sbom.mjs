#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function computeFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function validateCommitSha(sha) {
  if (!sha || typeof sha !== "string") return false;
  return /^[0-9a-f]{40}$/i.test(sha.trim());
}

function resolveGitMetadata(options = {}) {
  let commit = options.sourceCommit || process.env.SOURCE_COMMIT || null;
  let buildSourceCommit = options.buildSourceCommit || process.env.BUILD_SOURCE_COMMIT || null;
  let tag = options.tag || process.env.RELEASE_TAG || null;
  let repoUrl =
    options.repoUrl || process.env.REPO_URL || "https://github.com/Baby-Angel404/Open-Agent";

  if (!commit) {
    try {
      commit = execSync("git rev-parse HEAD", {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      commit = null;
    }
  }

  if (commit && !validateCommitSha(commit)) {
    throw new Error(
      `Invalid source commit SHA: "${commit}". Expected 40-character hexadecimal SHA.`
    );
  }

  if (buildSourceCommit && !validateCommitSha(buildSourceCommit)) {
    throw new Error(
      `Invalid build source commit SHA: "${buildSourceCommit}". Expected 40-character hexadecimal SHA.`
    );
  }

  if (options.strict && !commit) {
    throw new Error(
      "Strict mode: Source commit SHA could not be determined from environment or git repository."
    );
  }

  if (!tag) {
    try {
      const gitTag = execSync("git describe --tags --exact-match 2>/dev/null || true", {
        cwd: rootDir,
        encoding: "utf-8",
      }).trim();
      if (gitTag) tag = gitTag;
    } catch {
      tag = null;
    }
  }

  return {
    commit: commit || null,
    buildSourceCommit: buildSourceCommit || commit || null,
    tag: tag || null,
    repoUrl,
  };
}

function parseArgs(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source-commit" && args[i + 1]) options.sourceCommit = args[++i];
    else if (args[i] === "--build-source-commit" && args[i + 1])
      options.buildSourceCommit = args[++i];
    else if (args[i] === "--tag" && args[i + 1]) options.tag = args[++i];
    else if (args[i] === "--repo-url" && args[i + 1]) options.repoUrl = args[++i];
    else if (args[i] === "--output-cyclonedx" && args[i + 1]) options.outputCycloneDX = args[++i];
    else if (args[i] === "--output-spdx" && args[i + 1]) options.outputSPDX = args[++i];
    else if (args[i] === "--strict") options.strict = true;
  }
  return options;
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

function generateCycloneDX(options = {}) {
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

  const gitMeta = resolveGitMetadata(options);

  const vcsProperties = [];
  if (gitMeta.repoUrl)
    vcsProperties.push({ name: "openagent:vcs:repository", value: gitMeta.repoUrl });
  if (gitMeta.commit) vcsProperties.push({ name: "openagent:vcs:commit", value: gitMeta.commit });
  if (gitMeta.buildSourceCommit && gitMeta.buildSourceCommit !== gitMeta.commit) {
    vcsProperties.push({
      name: "openagent:vcs:build_source_commit",
      value: gitMeta.buildSourceCommit,
    });
  }
  if (gitMeta.tag) vcsProperties.push({ name: "openagent:vcs:tag", value: gitMeta.tag });

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
        properties: vcsProperties.length > 0 ? vcsProperties : undefined,
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

  const outputPath = options.outputCycloneDX || path.join(rootDir, "sbom.cyclonedx.json");
  fs.writeFileSync(outputPath, JSON.stringify(bom, null, 2), "utf-8");
  console.log(`Generated CycloneDX SBOM at: ${outputPath} (${components.length} components)`);

  // Also produce SPDX 2.3 format
  const spdxSourceInfo = gitMeta.commit
    ? `Source Git commit: ${gitMeta.commit}${
        gitMeta.buildSourceCommit && gitMeta.buildSourceCommit !== gitMeta.commit
          ? ` (Compiled from source commit: ${gitMeta.buildSourceCommit})`
          : ""
      }${gitMeta.tag ? ` (Release tag: ${gitMeta.tag})` : ""}`
    : "NOASSERTION";

  const spdxDownloadLocation =
    gitMeta.commit && gitMeta.repoUrl ? `git+${gitMeta.repoUrl}@${gitMeta.commit}` : "NOASSERTION";

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
        downloadLocation: spdxDownloadLocation,
        sourceInfo: spdxSourceInfo,
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

  const spdxOutputPath = options.outputSPDX || path.join(rootDir, "sbom.spdx.json");
  fs.writeFileSync(spdxOutputPath, JSON.stringify(spdx, null, 2), "utf-8");
  console.log(`Generated SPDX 2.3 SBOM at: ${spdxOutputPath}`);

  return { cycloneDX: bom, spdx, outputPath, spdxOutputPath };
}

export { validateCommitSha, resolveGitMetadata, generateCycloneDX, parseArgs };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs();
  generateCycloneDX(options);
}
