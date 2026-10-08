# Desktop Application Architecture

## 1. Overview & Core Philosophy

The OpenAgent Desktop Application productizes the open-source agent infrastructure into a secure, cross-platform graphical environment for Windows, Linux, and macOS. The desktop runtime enforces a strict local-first paradigm: all models, vector embeddings, graph traversals, and cryptographic credentials execute within the user's local operating system environment.

## 2. Multi-Process Architecture

OpenAgent Desktop uses an isolated multi-process architecture model:

```
+-----------------------------------------------------------------------------------------+
|                                    RENDERER PROCESS                                     |
|  - High-Contrast Dark-Mode Design System (HTML5, Vanilla ES Modules, CSS Variables)     |
|  - Unified Workspaces: System, Agent, Browser, RAG, Network, Capabilities, Settings     |
|  - Sandboxed UI (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`)   |
+-----------------------------------------------------------------------------------------+
                                           |
                                [contextBridge IPC API]
                                           |
+-----------------------------------------------------------------------------------------+
|                                  PRELOAD ISOLATION LAYER                                |
|  - Channel Whitelist Enforcement (Rejects unauthorized channels)                        |
|  - Bidirectional Safe Serialization                                                     |
|  - Memory-Safe Event Listener Cleanup                                                   |
+-----------------------------------------------------------------------------------------+
                                           |
                                  [ipcMain / ipcRenderer]
                                           |
+-----------------------------------------------------------------------------------------+
|                                      MAIN PROCESS                                       |
|  - Subsystem Lifecycle Supervisor                                                       |
|  - Single-Instance Application Mutex Lock                                               |
|  - Web Preferences Hardening & Content Security Policy (CSP)                            |
|  - AES-256-GCM Credential Vault                                                         |
|  - Atomic Backup & Restore Engine (Path-Traversal & Checksum Guards)                    |
|  - IPC Dispatcher with Parameter Validation & Error Redaction                           |
+-----------------------------------------------------------------------------------------+
                                           |
         +---------------------------------+---------------------------------+
         |                                 |                                 |
         v                                 v                                 v
+------------------+             +--------------------+            +--------------------+
|  Agent Runtime   |             |  Hybrid Vector &   |            |   Decentralized    |
|  Policy Engine   |             |  Graph RAG Engine  |            |    Network Node    |
|   Audit Store    |             | (Local Embeddings) |            |  (Peer Discovery)  |
+------------------+             +--------------------+            +--------------------+
         |                                 |                                 |
         +---------------------------------+---------------------------------+
                                           |
                                           v
                       +---------------------------------------+
                       |   Loopback Gateway (127.0.0.1:PORT)   |
                       |    - Ephemeral Local Port Assignment  |
                       |    - Origin Whitelist (localhost)     |
                       |    - Rate Limiting & DoS Mitigation   |
                       +---------------------------------------+
```

## 3. Subsystem Lifecycle Supervisor

The `SubsystemLifecycle` controller coordinates the graceful initialization, health reporting, and zero-downtime shutdown of all six core packages:

- **AppendOnlyAuditStore**: Cryptographic SHA-256 hash-chained immutable event log.
- **PolicyEngine**: Deterministic rule-based access controller evaluated before any agent action.
- **AgentRuntime**: Session execution supervisor dispatching approved actions to executors.
- **VectorEngine**: Dense and sparse hybrid retrieval engine with persistent local storage.
- **GraphRAGEngine**: Knowledge graph storage, entity normalization, and context assembler.
- **NetworkNode**: Authenticated peer discovery, capability advertisement, and remote capability execution.
- **LocalAPIServer**: Embedded loopback HTTP gateway bound strictly to `127.0.0.1`.

## 4. Loopback API Gateway

In addition to Electron IPC channels, the application spins up an embedded HTTP server on loopback interface (`127.0.0.1`) assigned to an ephemeral port (`port: 0`). This allows local developer tools, CLI scripts, and browser extensions to interact with the running desktop instance securely without exposing external network ports.
