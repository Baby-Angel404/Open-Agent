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

function printUsage(): void {
  console.log(`
OpenAgent CLI - Deterministic Policy, Local Agent Runtime & Audit Subsystem (Phase 3)

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

  --help, -h                                  Show this help menu
`);
}

function parseArgs(args: string[]): {
  command: string;
  subcommand?: string;
  options: Record<string, string>;
} {
  const result: { command: string; subcommand?: string; options: Record<string, string> } = {
    command: "",
    options: {},
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
      // Positional argument for subcommand (e.g. `openagent session replay sess_123`)
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
