# Artifact Verification Guide

All official OpenAgent Infrastructure release binaries, tarballs, and SBOMs are distributed alongside SHA-256 checksums and cryptographic attestations.

## 1. Verifying SHA-256 Checksums

Download the release artifact and `SHA256SUMS` from the official release page:

```bash
# Verify checksums on Linux
sha256sum --check SHA256SUMS --ignore-missing

# Verify checksums on macOS
shasum -a 256 -c SHA256SUMS
```

The output must indicate `OK` for every downloaded artifact.

## 2. Inspecting and Validating the Software Bill of Materials (SBOM)

OpenAgent distributes both CycloneDX (`sbom.cyclonedx.json`) and SPDX (`sbom.spdx.json`) compliant SBOMs.

You can inspect and validate the SBOM using standard tooling:

```bash
# Validate CycloneDX SBOM using cyclonedx-cli
cyclonedx-cli validate --input-file sbom.cyclonedx.json

# Audit components for known vulnerabilities using osv-scanner
osv-scanner --sbom=sbom.cyclonedx.json
```

## 3. Cryptographic Signature Verification

For releases signed with maintainer PGP keys:

```bash
gpg --verify SHA256SUMS.sig SHA256SUMS
```
