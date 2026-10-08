# Release Process

This document defines the repeatable, secure release lifecycle for OpenAgent Infrastructure.

## 1. Release Schedule & Cadence

- **Major Releases (`X.0.0`)**: Breaking protocol, API, or architectural boundary modifications. Scheduled with minimum 30-day notice.
- **Minor Releases (`0.X.0`)**: New features, capabilities, or architectural expansions that maintain backwards compatibility.
- **Patch Releases (`0.0.X`)**: Bug fixes, security remediations, and performance optimizations.

## 2. Pre-Release Checklist

Before any release tag is created, maintainers must verify:

1. **Monorepo Compilation & Typecheck**:
   ```bash
   npm run build
   npm run typecheck
   ```
2. **Automated Test Suites (100% Passing)**:
   ```bash
   npm run test
   ```
3. **Security Regression Suite (15 Test Cases Passing)**:
   ```bash
   npm run test:security
   ```
4. **Formatting & Style Compliance**:
   ```bash
   npm run format:check
   ```
5. **Clean Dependency Tree**:
   Ensure `npm audit` reports zero high or critical vulnerabilities.
6. **Changelog Updated**:
   `CHANGELOG.md` reflects all notable changes under the target release header following Keep a Changelog.

## 3. Tagging & Publication

1. Create and push an annotated Git tag:
   ```bash
   git tag -s -a v0.1.0 -m "Release v0.1.0"
   git push origin v0.1.0
   ```
2. GitHub Actions automated release pipeline triggers:
   - Compiles packages and packages desktop applications.
   - Generates CycloneDX 1.5 JSON and SPDX 2.3 JSON SBOM files.
   - Computes SHA-256 checksums for all release binaries.
   - Creates GitHub Release with attached binaries, checksums, and SBOMs.
