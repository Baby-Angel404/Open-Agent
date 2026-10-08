# Knowledge Graph & RAG API Reference

Complete reference for HTTP REST endpoints and CLI commands.

## HTTP REST Endpoints

All endpoints are hosted by `packages/core/src/api/server.ts` (default: `http://localhost:3000`).

### Graph Endpoints

- `GET /api/v1/graph/manifest`: Return storage manifest and element counts.
- `GET /api/v1/graph/entities`: List entities with optional filters (`?type=...&query=...&limit=50`).
- `GET /api/v1/graph/entities/:id`: Get entity details, outgoing/incoming relationships, and metadata.
- `GET /api/v1/graph/entities/:id/neighbors`: Traverse entity neighborhood (`?depth=2&direction=both`).
- `GET /api/v1/graph/path`: Find traversal path between entities (`?from=:srcId&to=:tgtId&maxDepth=3`).
- `POST /api/v1/graph/ingest`: Ingest document text into graph (`{ id, text, metadata }`).
- `POST /api/v1/graph/verify`: Audit graph referential consistency.
- `POST /api/v1/graph/repair`: Prune dangling relationships and repair integrity.

### RAG Endpoints

- `POST /api/v1/rag/query`: Grounded Graph RAG question answering.
  ```json
  {
    "query": "What does OpenAgent Infrastructure implement?",
    "collection": "default",
    "expandGraph": true,
    "maxDepth": 2,
    "topK": 5
  }
  ```

## CLI Commands

```bash
# Graph Status & Inspection
openagent graph status
openagent graph entities [--type <type>] [--query <q>]
openagent graph entity <id>
openagent graph relationships [--predicate <p>]
openagent graph neighbors <id> [--depth <n>]
openagent graph path <sourceId> <targetId> [--max-depth <n>]
openagent graph search "<query>"

# Document Ingestion & Maintenance
openagent graph ingest <filePath> [--id <docId>]
openagent graph verify
openagent graph repair

# Grounded Graph RAG
openagent rag query "<question>" [--collection <name>] [--depth <n>] [--top-k <n>]
```

## Source Files

- Route Handler: [`packages/graph/src/api/routes.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/api/routes.ts)
- Server Dispatch: [`packages/core/src/api/server.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/core/src/api/server.ts)
- CLI Handlers: [`apps/cli/src/commands/graph.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/apps/cli/src/commands/graph.ts) & [`apps/cli/src/commands/rag.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/apps/cli/src/commands/rag.ts)
