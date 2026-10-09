import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  validateCommitSha,
  resolveGitMetadata,
  generateCycloneDX,
} from "../../scripts/generate-sbom.mjs";
import { buildDeterministicTarCommand } from "../../apps/desktop/scripts/package.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

describe("Supply-Chain Policy & Verification Suite (Offline Negative Tests)", () => {
  // 1. Commit SHA Validation
  describe("Commit SHA Validator", () => {
    it("should accept valid 40-character hexadecimal SHA-1 strings", () => {
      assert.strictEqual(validateCommitSha("ff7a6a054ce1341288bc49ec1054030f3bdecf78"), true);
      assert.strictEqual(validateCommitSha("66af61898d858e1888bea79554b83d0bc7338212"), true);
      assert.strictEqual(validateCommitSha("0123456789abcdef0123456789abcdef01234567"), true);
    });

    it("should reject short, invalid, or malformed commit identifiers", () => {
      assert.strictEqual(validateCommitSha("ff7a6a0"), false, "Short SHA rejected");
      assert.strictEqual(
        validateCommitSha("g000000000000000000000000000000000000000"),
        false,
        "Non-hex rejected"
      );
      assert.strictEqual(validateCommitSha(""), false, "Empty string rejected");
      assert.strictEqual(validateCommitSha(null), false, "Null rejected");
      assert.strictEqual(validateCommitSha(undefined), false, "Undefined rejected");
      assert.strictEqual(
        validateCommitSha("ff7a6a054ce1341288bc49ec1054030f3bdecf78extra"),
        false,
        "Oversized rejected"
      );
    });
  });

  // 2. Git Metadata Resolution
  describe("Git Metadata Resolution & Strict Mode", () => {
    it("should throw when an invalid explicit commit SHA is passed", () => {
      assert.throws(
        () => resolveGitMetadata({ sourceCommit: "invalid-sha-123" }),
        /Invalid source commit SHA/
      );
    });

    it("should throw when an invalid build source commit SHA is passed", () => {
      assert.throws(
        () =>
          resolveGitMetadata({
            sourceCommit: "ff7a6a054ce1341288bc49ec1054030f3bdecf78",
            buildSourceCommit: "short",
          }),
        /Invalid build source commit SHA/
      );
    });

    it("should throw in strict mode when commit cannot be resolved", () => {
      // Simulate unresolvable git commit by overriding env and passing strict
      const origSourceCommit = process.env.SOURCE_COMMIT;
      delete process.env.SOURCE_COMMIT;
      // Pass empty commit explicitly with strict
      assert.throws(
        () => resolveGitMetadata({ sourceCommit: "not-a-sha", strict: true }),
        /Invalid source commit SHA/
      );
      if (origSourceCommit) process.env.SOURCE_COMMIT = origSourceCommit;
    });

    it("should distinguish build source commit from release commit", () => {
      const buildCommit = "66af61898d858e1888bea79554b83d0bc7338212";
      const tagCommit = "ff7a6a054ce1341288bc49ec1054030f3bdecf78";
      const meta = resolveGitMetadata({
        sourceCommit: tagCommit,
        buildSourceCommit: buildCommit,
        tag: "v0.2.0-alpha.1",
      });
      assert.strictEqual(meta.commit, tagCommit);
      assert.strictEqual(meta.buildSourceCommit, buildCommit);
      assert.strictEqual(meta.tag, "v0.2.0-alpha.1");
    });
  });

  // 3. SBOM Metadata Injection & Version Policy
  describe("SBOM Metadata Policy", () => {
    it("should inject standards-compliant VCS properties into CycloneDX and SPDX without touching release staging", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openagent-sbom-test-"));
      try {
        const outCdx = path.join(tempDir, "test.cyclonedx.json");
        const outSpdx = path.join(tempDir, "test.spdx.json");

        const result = generateCycloneDX({
          sourceCommit: "ff7a6a054ce1341288bc49ec1054030f3bdecf78",
          buildSourceCommit: "66af61898d858e1888bea79554b83d0bc7338212",
          tag: "v0.2.0-alpha.1",
          outputCycloneDX: outCdx,
          outputSPDX: outSpdx,
        });

        // Verify CycloneDX properties
        const cdx = JSON.parse(fs.readFileSync(outCdx, "utf-8"));
        const props = cdx.metadata.component.properties;
        assert.ok(Array.isArray(props), "Component properties should be present");
        const commitProp = props.find((p) => p.name === "openagent:vcs:commit");
        const buildProp = props.find((p) => p.name === "openagent:vcs:build_source_commit");
        const tagProp = props.find((p) => p.name === "openagent:vcs:tag");

        assert.strictEqual(commitProp?.value, "ff7a6a054ce1341288bc49ec1054030f3bdecf78");
        assert.strictEqual(buildProp?.value, "66af61898d858e1888bea79554b83d0bc7338212");
        assert.strictEqual(tagProp?.value, "v0.2.0-alpha.1");

        // Verify SPDX sourceInfo and downloadLocation
        const spdx = JSON.parse(fs.readFileSync(outSpdx, "utf-8"));
        const rootPkg = spdx.packages[0];
        assert.ok(rootPkg.sourceInfo.includes("ff7a6a054ce1341288bc49ec1054030f3bdecf78"));
        assert.ok(rootPkg.sourceInfo.includes("66af61898d858e1888bea79554b83d0bc7338212"));
        assert.ok(rootPkg.downloadLocation.includes("ff7a6a054ce1341288bc49ec1054030f3bdecf78"));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should reject SBOM with incorrect project version during verification check", () => {
      const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
      const fakeSbom = {
        bomFormat: "CycloneDX",
        metadata: { component: { name: "open-agent-infrastructure", version: "9.9.9-malicious" } },
      };

      const verifySbomVersion = (sbom, expectedVersion) => {
        if (sbom.metadata?.component?.version !== expectedVersion) {
          throw new Error(
            `SBOM version mismatch: expected ${expectedVersion}, got ${sbom.metadata?.component?.version}`
          );
        }
      };

      assert.throws(() => verifySbomVersion(fakeSbom, rootPkg.version), /SBOM version mismatch/);
    });
  });

  // 4. Deterministic Archive Packaging
  describe("Deterministic Archive Packaging", () => {
    it("should produce bit-for-bit identical tarballs from identical source trees regardless of creation order or time", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openagent-tar-test-"));
      try {
        const fixtureDir1 = path.join(tempDir, "fixture1", "test-app");
        const fixtureDir2 = path.join(tempDir, "fixture2", "test-app");
        fs.mkdirSync(fixtureDir1, { recursive: true });
        fs.mkdirSync(fixtureDir2, { recursive: true });

        // Add files in opposite order and with sleep
        fs.writeFileSync(path.join(fixtureDir1, "zeta.txt"), "content zeta");
        fs.writeFileSync(path.join(fixtureDir1, "alpha.txt"), "content alpha");

        fs.writeFileSync(path.join(fixtureDir2, "alpha.txt"), "content alpha");
        fs.writeFileSync(path.join(fixtureDir2, "zeta.txt"), "content zeta");

        const tar1 = path.join(tempDir, "pkg1.tar.gz");
        const tar2 = path.join(tempDir, "pkg2.tar.gz");

        const cmd1 = buildDeterministicTarCommand(
          path.join(tempDir, "fixture1"),
          "test-app",
          tar1,
          {
            mtime: "2026-01-01 00:00:00Z",
          }
        );
        const cmd2 = buildDeterministicTarCommand(
          path.join(tempDir, "fixture2"),
          "test-app",
          tar2,
          {
            mtime: "2026-01-01 00:00:00Z",
          }
        );

        execSync(cmd1, { shell: "/bin/bash" });
        execSync(cmd2, { shell: "/bin/bash" });

        const hash1 = crypto.createHash("sha256").update(fs.readFileSync(tar1)).digest("hex");
        const hash2 = crypto.createHash("sha256").update(fs.readFileSync(tar2)).digest("hex");

        assert.strictEqual(
          hash1,
          hash2,
          "Deterministic archives must have identical SHA-256 digests"
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should demonstrate that unnormalized packaging produces different digests over timestamp changes", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openagent-unnorm-test-"));
      try {
        const fixtureDir = path.join(tempDir, "fixture", "test-app");
        fs.mkdirSync(fixtureDir, { recursive: true });
        fs.writeFileSync(path.join(fixtureDir, "data.txt"), "sample data");

        const tarA = path.join(tempDir, "unnormA.tar.gz");
        const tarB = path.join(tempDir, "unnormB.tar.gz");

        // Standard tar without mtime normalization
        execSync(`tar -czf "${tarA}" -C "${path.join(tempDir, "fixture")}" test-app`);
        // Modify mtime
        const now = new Date(Date.now() + 60000);
        fs.utimesSync(path.join(fixtureDir, "data.txt"), now, now);
        execSync(`tar -czf "${tarB}" -C "${path.join(tempDir, "fixture")}" test-app`);

        const hashA = crypto.createHash("sha256").update(fs.readFileSync(tarA)).digest("hex");
        const hashB = crypto.createHash("sha256").update(fs.readFileSync(tarB)).digest("hex");

        assert.notStrictEqual(hashA, hashB, "Unnormalized archives must diverge across timestamps");
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should propagate errors when packaging command fails on non-existent targets", () => {
      const nonExistentDir = path.join(os.tmpdir(), "non-existent-" + crypto.randomUUID());
      const outTar = path.join(os.tmpdir(), "fail-" + crypto.randomUUID() + ".tar.gz");
      const cmd = buildDeterministicTarCommand(nonExistentDir, "invalid-target", outTar);
      assert.throws(() => execSync(cmd, { shell: "/bin/bash", stdio: "ignore" }), /Command failed/);
      if (fs.existsSync(outTar)) fs.rmSync(outTar, { force: true });
    });
  });

  // 5. Archive Security & Permission Scanners
  describe("Archive Security Policy Scanners", () => {
    it("should detect and reject archives containing path traversal entries", () => {
      const checkArchivePaths = (fileList) => {
        for (const file of fileList) {
          if (file.startsWith("/") || file.includes("../") || file.includes("/..")) {
            throw new Error(`SecurityPolicy: Path traversal or absolute path detected: "${file}"`);
          }
        }
      };

      const maliciousFileList = ["app/index.js", "app/../../etc/shadow"];
      assert.throws(
        () => checkArchivePaths(maliciousFileList),
        /Path traversal or absolute path detected/
      );
    });

    it("should detect and reject archives containing insecure file permissions", () => {
      const auditMemberModes = (members) => {
        for (const m of members) {
          // Check for world-writable (mode & 0002)
          if ((m.mode & 0o002) !== 0) {
            throw new Error(
              `SecurityPolicy: Insecure world-writable file detected: "${m.name}" (${m.mode.toString(8)})`
            );
          }
        }
      };

      const unsafeMembers = [
        { name: "openagent-desktop", mode: 0o755 },
        { name: "launch.sh", mode: 0o777 }, // world-writable
      ];

      assert.throws(() => auditMemberModes(unsafeMembers), /Insecure world-writable file detected/);
    });
  });

  // 6. Offline Attestation & Trust Policy Verification
  describe("Offline Provenance & Trust Policy Negative Tests", () => {
    const trustedPolicy = {
      expectedRepo: "https://github.com/Baby-Angel404/Open-Agent",
      expectedWorkflow: ".github/workflows/release.yml",
      expectedOidcIssuer: "https://token.actions.githubusercontent.com",
      expectedCommit: "66af61898d858e1888bea79554b83d0bc7338212",
    };

    const verifyAttestationPolicy = (artifactBuffer, expectedDigest, attestation, policy) => {
      // 1. Digest byte check
      const actualDigest = crypto.createHash("sha256").update(artifactBuffer).digest("hex");
      if (actualDigest !== expectedDigest) {
        throw new Error(
          `IntegrityError: Artifact digest mismatch: expected ${expectedDigest}, got ${actualDigest}`
        );
      }

      // 2. Malformed attestation check
      if (!attestation || typeof attestation !== "object" || !attestation.predicate) {
        throw new Error("AttestationError: Missing or malformed attestation structure");
      }

      // 3. Subject digest match
      if (attestation.subject?.[0]?.digest?.sha256 !== actualDigest) {
        throw new Error("AttestationError: Attestation subject digest does not match artifact");
      }

      // 4. Issuer check
      if (attestation.signer?.oidcIssuer !== policy.expectedOidcIssuer) {
        throw new Error(
          `TrustPolicyError: Untrusted OIDC issuer: "${attestation.signer?.oidcIssuer}"`
        );
      }

      // 5. Repository check
      if (attestation.predicate?.invocation?.configSource?.uri !== policy.expectedRepo) {
        throw new Error(
          `TrustPolicyError: Unauthorized repository: "${attestation.predicate?.invocation?.configSource?.uri}"`
        );
      }

      // 6. Commit check
      if (
        attestation.predicate?.invocation?.configSource?.digest?.gitCommit !== policy.expectedCommit
      ) {
        throw new Error(
          `TrustPolicyError: Source commit mismatch: expected ${policy.expectedCommit}`
        );
      }

      return true;
    };

    const validPayload = Buffer.from("authentic binary content");
    const validDigest = crypto.createHash("sha256").update(validPayload).digest("hex");

    const validAttestation = {
      subject: [{ name: "openagent-desktop.tar.gz", digest: { sha256: validDigest } }],
      signer: { oidcIssuer: "https://token.actions.githubusercontent.com" },
      predicate: {
        invocation: {
          configSource: {
            uri: "https://github.com/Baby-Angel404/Open-Agent",
            digest: { gitCommit: "66af61898d858e1888bea79554b83d0bc7338212" },
          },
        },
      },
    };

    it("should accept valid artifact and matching attestation under policy", () => {
      assert.strictEqual(
        verifyAttestationPolicy(validPayload, validDigest, validAttestation, trustedPolicy),
        true
      );
    });

    it("should reject tampered artifact (altered byte)", () => {
      const tamperedPayload = Buffer.from("tampered binary content");
      assert.throws(
        () =>
          verifyAttestationPolicy(tamperedPayload, validDigest, validAttestation, trustedPolicy),
        /Artifact digest mismatch/
      );
    });

    it("should reject attestation with wrong repository identity", () => {
      const spoofedRepoAttestation = JSON.parse(JSON.stringify(validAttestation));
      spoofedRepoAttestation.predicate.invocation.configSource.uri =
        "https://github.com/attacker/malicious-agent";

      assert.throws(
        () =>
          verifyAttestationPolicy(validPayload, validDigest, spoofedRepoAttestation, trustedPolicy),
        /Unauthorized repository/
      );
    });

    it("should reject attestation with wrong source commit", () => {
      const wrongCommitAttestation = JSON.parse(JSON.stringify(validAttestation));
      wrongCommitAttestation.predicate.invocation.configSource.digest.gitCommit =
        "0000000000000000000000000000000000000000";

      assert.throws(
        () =>
          verifyAttestationPolicy(validPayload, validDigest, wrongCommitAttestation, trustedPolicy),
        /Source commit mismatch/
      );
    });

    it("should reject attestation signed by untrusted OIDC issuer", () => {
      const untrustedIssuerAttestation = JSON.parse(JSON.stringify(validAttestation));
      untrustedIssuerAttestation.signer.oidcIssuer = "https://accounts.google.com";

      assert.throws(
        () =>
          verifyAttestationPolicy(
            validPayload,
            validDigest,
            untrustedIssuerAttestation,
            trustedPolicy
          ),
        /Untrusted OIDC issuer/
      );
    });

    it("should reject missing or malformed attestation", () => {
      assert.throws(
        () => verifyAttestationPolicy(validPayload, validDigest, null, trustedPolicy),
        /Missing or malformed attestation structure/
      );
      assert.throws(
        () => verifyAttestationPolicy(validPayload, validDigest, {}, trustedPolicy),
        /Missing or malformed attestation structure/
      );
    });
  });
});
