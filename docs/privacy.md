# Privacy & Telemetry Policy

## 1. Zero Telemetry Commitment

OpenAgent Infrastructure is built on a fundamental privacy-first commitment:

- **No Remote Telemetry**: OpenAgent does NOT send usage telemetry, analytics, tracking pings, or diagnostic crash reports to any external servers.
- **Local-Only Execution**: All agent planning, embeddings, vector indexing, and knowledge graph resolution run on your local hardware.
- **Deterministic LLMs**: Default local execution uses scripted deterministic providers. When third-party providers (such as OpenAI or local Ollama endpoints) are configured, requests are sent strictly to the endpoints explicitly supplied by the user.

## 2. Cryptographic Audit Log Isolation

- All agent actions, policy evaluations, and executor outputs are recorded in a local append-only log (`audit.jsonl`).
- Redaction filters automatically mask sensitive data patterns (tokens, credit cards, credentials) prior to disk persistence.
- Audit logs remain strictly on the host file system and are never synchronized over the network without explicit user export commands.

## 3. Credential Isolation

- Secrets stored in the Credential Vault are encrypted at rest using AES-256-GCM.
- Secrets are never emitted to application logs, audit trails, or desktop UI views.
