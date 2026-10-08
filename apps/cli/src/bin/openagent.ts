#!/usr/bin/env node

import { handleAgentStatus, handleAgentStart, handleAgentStop } from "../commands/agent.js";
import { handlePolicyCheck, handlePolicyList } from "../commands/policy.js";
import {
  handleAuditList,
  handleAuditShow,
  handleAuditVerify,
  handleAuditExport,
} from "../commands/audit.js";
import { handleSessionList, handleSessionShow, handleSessionReplay } from "../commands/session.js";
import { handleMetrics } from "../commands/metrics.js";
import {
  handleCollectionCreate,
  handleCollectionList,
  handleCollectionDelete,
  handleDocumentAdd,
  handleDocumentIndex,
  handleSearch,
  handleIndexStatus,
  handleVectorBenchmark,
} from "../commands/vector.js";
import {
  handleGraphStatus,
  handleGraphEntities,
  handleGraphEntityShow,
  handleGraphRelationships,
  handleGraphNeighbors,
  handleGraphPath,
  handleGraphSearch,
  handleGraphIngest,
  handleGraphVerify,
  handleGraphRepair,
} from "../commands/graph.js";
import { handleRagQuery } from "../commands/rag.js";

function printUsage(): void {
  console.log(`
OpenAgent CLI - Autonomous Agent, Policy, Replay, Vector & Graph RAG Engine (Phase 5)

Usage:
  openagent <command> <subcommand> [options]

Commands:
  agent start --task <task> [options]         Start a local autonomous agent task
      Options:
        --agent <id>                          Agent identifier (default: agent_local)
        --policy <path>                       Path to custom policy JSON
        --steps <number>                      Maximum steps to execute (default: 3)
  agent stop --session <sessionId>            Emergency stop an active session
  agent status                                Display local agent infrastructure status

  session list                                List tracked agent sessions
  session show --id <sessionId>               Show detailed session history and metadata
  session replay <sessionId> [options]        Deterministically replay session timeline
      Options:
        --verbose                             Include full action payloads and results
        --format <text|json>                  Output format (default: text)
        --file <path>                         Audit log path

  policy check --action <type> [options]      Evaluate an action against a policy
      Options:
        --target <target>                     Target url, path, or identifier
        --policy <path>                       Path to policy JSON file
  policy list [--policy <path>]               List rules and configuration in policy

  audit list [--file <path>]                  Inspect local append-only audit trail
  audit show --id <eventId> [--file <path>]   Show full details of a specific audit event
  audit verify [--session <id>] [--file <p>]  Verify SHA-256 hash chain cryptographic integrity
  audit export --session <id> [options]       Export verifiable audit bundle with proofs
      Options:
        --output <path>                       Output JSON file path
        --file <path>                         Audit log path

  metrics [--json] [--file <path>]            Display operational & security metrics

  collection create <name> [options]          Create vector collection (--dim <n>, --metric <m>)
  collection list                             List all vector collections
  collection delete <name>                    Delete a vector collection

  document add <collection> --file <path>     Ingest and chunk document into collection
  document index <collection>                 Verify and synchronize index

  search <collection> --query "..." [options] Perform hybrid/dense/sparse retrieval
      Options:
        --mode <hybrid|dense|sparse>          Search mode (default: hybrid)
        --top-k <n>                           Number of results (default: 5)
        --min-score <n>                       Minimum score threshold
        --filter <json>                       Metadata filter JSON

  index status <collection>                   Display vector and keyword index status

  benchmark vector [options]                  Run local vector ingestion & retrieval benchmark

  graph status [options]                      Display Knowledge Graph summary & counts
  graph entities [options]                    List or filter entities (--type, --query, --limit)
  graph entity <id> [options]                 Show entity details, aliases, and edges
  graph relationships [options]               List relationships (--predicate, --subject, --object)
  graph neighbors <id> [options]              Traverse connected entity neighborhood (--depth)
  graph path <src> <target> [options]         Find shortest directed traversal path (--max-depth)
  graph search <query> [options]              Search graph entities by name/alias (--limit)
  graph ingest <file> [options]               Extract and ingest document into Knowledge Graph
  graph verify [options]                      Verify entity/relationship referential integrity
  graph repair [options]                      Prune dangling references and repair graph

  rag query "<question>" [options]            Query system using grounded Graph RAG
      Options:
        --collection <name>                   Vector collection name
        --expand-graph                        Traverse Knowledge Graph (default: true)
        --depth <n>                           Graph traversal depth (default: 2)
        --top-k <n>                           Number of vector chunks (default: 5)

  --help, -h                                  Show this help menu
`);
}

function parseArgs(args: string[]): {
  command: string;
  subcommand?: string;
  options: Record<string, string>;
  positionals: string[];
} {
  const result: {
    command: string;
    subcommand?: string;
    options: Record<string, string>;
    positionals: string[];
  } = {
    command: "",
    options: {},
    positionals: [],
  };

  let idx = 0;
  if (idx < args.length && !args[idx].startsWith("-")) {
    result.command = args[idx++];
  }
  if (idx < args.length && !args[idx].startsWith("-")) {
    result.subcommand = args[idx++];
  }

  while (idx < args.length) {
    const arg = args[idx];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[idx + 1];
      if (next && !next.startsWith("-")) {
        result.options[key] = next;
        idx += 2;
      } else {
        result.options[key] = "true";
        idx++;
      }
    } else {
      result.positionals.push(arg);
      if (!result.options["_pos"]) {
        result.options["_pos"] = arg;
      }
      idx++;
    }
  }

  return result;
}

export async function runCLI(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv.slice(2));

  try {
    switch (parsed.command) {
      case "agent":
        if (parsed.subcommand === "status") {
          handleAgentStatus();
        } else if (parsed.subcommand === "start") {
          const task = parsed.options["task"];
          if (!task) {
            console.error("Error: --task is required for agent start");
            process.exit(1);
          }
          const maxSteps = parsed.options["steps"]
            ? parseInt(parsed.options["steps"], 10)
            : undefined;
          await handleAgentStart({
            task,
            agentId: parsed.options["agent"],
            policyFile: parsed.options["policy"],
            maxSteps,
          });
        } else if (parsed.subcommand === "stop") {
          const sessionId = parsed.options["session"];
          if (!sessionId) {
            console.error("Error: --session is required for agent stop");
            process.exit(1);
          }
          handleAgentStop({
            sessionId,
            reason: parsed.options["reason"],
          });
        } else {
          printUsage();
        }
        break;

      case "session":
        if (parsed.subcommand === "list") {
          handleSessionList();
        } else if (parsed.subcommand === "show") {
          const id = parsed.options["id"] || parsed.options["_pos"];
          if (!id) {
            console.error("Error: --id is required for session show");
            process.exit(1);
          }
          handleSessionShow(id);
        } else if (parsed.subcommand === "replay") {
          const id = parsed.options["id"] || parsed.options["session"] || parsed.options["_pos"];
          if (!id) {
            console.error("Error: Session ID is required for session replay");
            process.exit(1);
          }
          handleSessionReplay(id, {
            verbose: parsed.options["verbose"] === "true",
            format: parsed.options["format"],
            filePath: parsed.options["file"],
          });
        } else {
          printUsage();
        }
        break;

      case "policy":
        if (parsed.subcommand === "check") {
          const action = parsed.options["action"];
          if (!action) {
            console.error("Error: --action is required for policy check");
            process.exit(1);
          }
          handlePolicyCheck({
            action,
            target: parsed.options["target"],
            policyFile: parsed.options["policy"],
          });
        } else if (parsed.subcommand === "list") {
          handlePolicyList(parsed.options["policy"]);
        } else {
          printUsage();
        }
        break;

      case "audit":
        if (parsed.subcommand === "list") {
          handleAuditList(parsed.options["file"]);
        } else if (parsed.subcommand === "show") {
          const id = parsed.options["id"] || parsed.options["_pos"];
          if (!id) {
            console.error("Error: --id is required for audit show");
            process.exit(1);
          }
          handleAuditShow(id, parsed.options["file"]);
        } else if (parsed.subcommand === "verify") {
          const ok = handleAuditVerify(parsed.options["file"], parsed.options["session"]);
          if (!ok) {
            process.exit(1);
          }
        } else if (parsed.subcommand === "export") {
          const sessionId =
            parsed.options["session"] || parsed.options["id"] || parsed.options["_pos"];
          if (!sessionId) {
            console.error("Error: --session is required for audit export");
            process.exit(1);
          }
          handleAuditExport(sessionId, parsed.options["output"], parsed.options["file"]);
        } else {
          printUsage();
        }
        break;

      case "metrics":
        handleMetrics({
          json: parsed.options["json"] === "true" || parsed.subcommand === "--json",
          filePath: parsed.options["file"],
        });
        break;

      case "collection":
        if (parsed.subcommand === "create") {
          const name = parsed.options["_pos"] || parsed.options["name"];
          if (!name) {
            console.error("Error: Collection name is required for collection create");
            process.exit(1);
          }
          await handleCollectionCreate(name, {
            dim: parsed.options["dim"] ? parseInt(parsed.options["dim"], 10) : undefined,
            metric: parsed.options["metric"],
            path: parsed.options["path"],
          });
        } else if (parsed.subcommand === "list") {
          await handleCollectionList({ path: parsed.options["path"] });
        } else if (parsed.subcommand === "delete") {
          const name = parsed.options["_pos"] || parsed.options["name"];
          if (!name) {
            console.error("Error: Collection name is required for collection delete");
            process.exit(1);
          }
          await handleCollectionDelete(name, { path: parsed.options["path"] });
        } else {
          printUsage();
        }
        break;

      case "document":
        if (parsed.subcommand === "add") {
          const collection = parsed.options["_pos"] || parsed.options["collection"];
          if (!collection) {
            console.error("Error: Collection name is required for document add");
            process.exit(1);
          }
          const file = parsed.options["file"];
          if (!file) {
            console.error("Error: --file is required for document add");
            process.exit(1);
          }
          await handleDocumentAdd(collection, {
            file,
            id: parsed.options["id"],
            chunkSize: parsed.options["chunk-size"]
              ? parseInt(parsed.options["chunk-size"], 10)
              : undefined,
            chunkOverlap: parsed.options["chunk-overlap"]
              ? parseInt(parsed.options["chunk-overlap"], 10)
              : undefined,
            path: parsed.options["path"],
          });
        } else if (parsed.subcommand === "index") {
          const collection = parsed.options["_pos"] || parsed.options["collection"];
          if (!collection) {
            console.error("Error: Collection name is required for document index");
            process.exit(1);
          }
          await handleDocumentIndex(collection, { path: parsed.options["path"] });
        } else {
          printUsage();
        }
        break;

      case "search": {
        const collection =
          parsed.options["collection"] || parsed.subcommand || parsed.options["_pos"];
        if (!collection) {
          console.error("Error: Collection name is required for search");
          process.exit(1);
        }
        const query = parsed.options["query"] || parsed.options["q"];
        if (!query) {
          console.error("Error: --query is required for search");
          process.exit(1);
        }
        await handleSearch(collection, {
          query,
          mode: parsed.options["mode"] as any,
          topK: parsed.options["top-k"] ? parseInt(parsed.options["top-k"], 10) : undefined,
          minScore: parsed.options["min-score"]
            ? parseFloat(parsed.options["min-score"])
            : undefined,
          filter: parsed.options["filter"],
          path: parsed.options["path"],
        });
        break;
      }

      case "index":
        if (parsed.subcommand === "status") {
          const collection = parsed.options["_pos"] || parsed.options["collection"];
          if (!collection) {
            console.error("Error: Collection name is required for index status");
            process.exit(1);
          }
          await handleIndexStatus(collection, { path: parsed.options["path"] });
        } else {
          printUsage();
        }
        break;

      case "benchmark":
        if (parsed.subcommand === "vector" || parsed.options["vector"] === "true") {
          await handleVectorBenchmark({
            dataset: parsed.options["dataset"],
            queries: parsed.options["queries"],
            count: parsed.options["count"] ? parseInt(parsed.options["count"], 10) : undefined,
            path: parsed.options["path"],
          });
        } else {
          printUsage();
        }
        break;

      case "graph":
        if (parsed.subcommand === "status") {
          await handleGraphStatus({ path: parsed.options["path"] });
        } else if (parsed.subcommand === "entities") {
          await handleGraphEntities({
            type: parsed.options["type"],
            query: parsed.options["query"] || parsed.options["q"],
            limit: parsed.options["limit"] ? parseInt(parsed.options["limit"], 10) : undefined,
            path: parsed.options["path"],
          });
        } else if (parsed.subcommand === "entity") {
          const id = parsed.positionals[0] || parsed.options["id"];
          if (!id) {
            console.error("Error: Entity ID is required for graph entity");
            process.exit(1);
          }
          await handleGraphEntityShow(id, { path: parsed.options["path"] });
        } else if (parsed.subcommand === "relationships" || parsed.subcommand === "rels") {
          await handleGraphRelationships({
            predicate: parsed.options["predicate"],
            subject: parsed.options["subject"],
            object: parsed.options["object"],
            limit: parsed.options["limit"] ? parseInt(parsed.options["limit"], 10) : undefined,
            path: parsed.options["path"],
          });
        } else if (parsed.subcommand === "neighbors") {
          const id = parsed.positionals[0] || parsed.options["id"];
          if (!id) {
            console.error("Error: Entity ID is required for graph neighbors");
            process.exit(1);
          }
          await handleGraphNeighbors(id, {
            depth: parsed.options["depth"] ? parseInt(parsed.options["depth"], 10) : undefined,
            path: parsed.options["path"],
          });
        } else if (parsed.subcommand === "path") {
          const src = parsed.positionals[0] || parsed.options["source"] || parsed.options["from"];
          const tgt = parsed.positionals[1] || parsed.options["target"] || parsed.options["to"];
          if (!src || !tgt) {
            console.error("Error: Source and Target entity IDs are required for graph path");
            process.exit(1);
          }
          await handleGraphPath(src, tgt, {
            maxDepth: parsed.options["max-depth"]
              ? parseInt(parsed.options["max-depth"], 10)
              : undefined,
            path: parsed.options["path"],
          });
        } else if (parsed.subcommand === "search") {
          const query = parsed.positionals[0] || parsed.options["query"] || parsed.options["q"];
          if (!query) {
            console.error("Error: Search query is required for graph search");
            process.exit(1);
          }
          await handleGraphSearch(query, {
            limit: parsed.options["limit"] ? parseInt(parsed.options["limit"], 10) : undefined,
            path: parsed.options["path"],
          });
        } else if (parsed.subcommand === "ingest") {
          const file = parsed.positionals[0] || parsed.options["file"];
          if (!file) {
            console.error("Error: File path is required for graph ingest");
            process.exit(1);
          }
          await handleGraphIngest(file, {
            documentId: parsed.options["id"],
            path: parsed.options["path"],
          });
        } else if (parsed.subcommand === "verify") {
          await handleGraphVerify({ path: parsed.options["path"] });
        } else if (parsed.subcommand === "repair") {
          await handleGraphRepair({ path: parsed.options["path"] });
        } else {
          printUsage();
        }
        break;

      case "rag":
        if (parsed.subcommand === "query") {
          const question =
            parsed.positionals.join(" ") ||
            parsed.options["question"] ||
            parsed.options["query"] ||
            parsed.options["q"];
          if (!question) {
            console.error("Error: Question string is required for rag query");
            process.exit(1);
          }
          await handleRagQuery(question, {
            collection: parsed.options["collection"],
            expandGraph: parsed.options["expand-graph"] !== "false",
            depth: parsed.options["depth"] ? parseInt(parsed.options["depth"], 10) : undefined,
            topK: parsed.options["top-k"] ? parseInt(parsed.options["top-k"], 10) : undefined,
            path: parsed.options["path"],
            vectorPath: parsed.options["vector-path"],
          });
        } else {
          printUsage();
        }
        break;

      case "--help":
      case "-h":
      case "help":
      case "":
        printUsage();
        break;

      default:
        console.error(`Unknown command: ${parsed.command}`);
        printUsage();
        process.exit(1);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("openagent.js") || process.argv[1]?.endsWith("openagent.ts")) {
  void runCLI(process.argv);
}
