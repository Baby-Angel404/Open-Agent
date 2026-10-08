# Distributed Retrieval-Augmented Generation (RAG)

Phase 6 extends the local Hybrid Vector Engine and Graph RAG with distributed cross-agent federation using the `DistributedRAGClient`.

## Federated Retrieval Architecture

```
User Query
    │
    ├── 1. Local Retrieval (Vector Index + Knowledge Graph)
    │      └── Tagged: [LOCAL EVIDENCE] (High Priority, Verified)
    │
    └── 2. Peer Discovery & Capability Filter (Find peers with document.search)
           │
           ├── 3. Remote Invocations (Policy Engine & Authenticator guarded)
           │
           ├── 4. Result Sanitization (Strip prompt injections & delimiters)
           │
           └── 5. Tagged: [REMOTE EVIDENCE: agent_xyz] (Provenance Recorded)
```

## Evidence Provenance & Conflict Resolution

1. **Local Precedence**: In the case of conflicting information between local and remote retrieval, local evidence takes precedence.
2. **Provenance Tracking**: Every retrieved chunk retains metadata indicating:
   - `source_agent_id`: Agent that produced the chunk
   - `capability_id`: Capability used (e.g. `document.search@1.0`)
   - `request_id`: Tracing identifier
   - `verified_local`: Boolean flag
3. **Indirect Prompt Injection Neutralization**:
   - Remote snippets are stripped of instruction tags like `[SYSTEM]`, `Ignore previous instructions:`, `<|im_start|>`, or markdown script injections before presentation to generation models.

## Source Reference

- Implementation: [`packages/network/src/rag/distributed-rag.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/rag/distributed-rag.ts)
- Types: [`packages/network/src/types/index.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/types/index.ts)
