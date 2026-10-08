# OpenAgent Infrastructure Governance

## 1. Overview & Project Charter

OpenAgent Infrastructure is an open-source platform providing deterministic, policy-controlled foundations for autonomous AI agents. The project adheres to transparent governance, open technical consensus, and strict security stewardship.

## 2. Roles and Responsibilities

### Maintainers

Maintainers are trusted contributors with commit and release authority across the repository.

- Review and merge pull requests according to architectural guidelines.
- Oversee code quality, testing standards, and dependency health.
- Participate in technical roadmap planning and architectural reviews.

### Security Team

The Security Team manages vulnerability intake, responsible disclosure, and patch orchestration.

- Monitors `security@openagent.org` and private vulnerability reports.
- Triages reported findings, assesses impact, and coordinates remediations under embargo.
- Publishes security advisories and coordinates CVE issuance where applicable.

### Contributors

Anyone who submits issues, pull requests, documentation improvements, or reviews.

## 3. Decision-Making Process

- **Technical Proposals**: Major architectural changes or breaking capability protocol changes require an RFC issue discussed in GitHub Discussions.
- **Consensus**: Decisions are made through lazy consensus among Maintainers with at least 72 hours for community feedback on substantial changes.
- **Security Decisions**: The Security Team has ultimate veto power over any changes that compromise deterministic default-deny or cryptographic verification.

## 4. Conflict Resolution

Disputes are escalated to the Core Maintainer council. If consensus cannot be reached, decisions default to preserving the safest, least-privileged architectural alternative.
