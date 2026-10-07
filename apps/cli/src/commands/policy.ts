import * as fs from "node:fs";
import * as path from "node:path";
import { PolicyEngine, Policy, AgentAction } from "@open-agent/core";

import * as url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadPolicy(policyPath?: string): Policy {
  const candidatePaths = policyPath
    ? [path.resolve(process.cwd(), policyPath), path.resolve(__dirname, policyPath)]
    : [
        path.resolve(process.cwd(), "examples/policies/default-security-policy.json"),
        path.resolve(process.cwd(), "../../examples/policies/default-security-policy.json"),
        path.resolve(__dirname, "../../../examples/policies/default-security-policy.json"),
      ];

  let resolved: string | undefined;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      resolved = p;
      break;
    }
  }

  if (!resolved) {
    throw new Error(`Policy file not found in candidates: ${candidatePaths.join(", ")}`);
  }

  const raw = fs.readFileSync(resolved, "utf-8");
  return JSON.parse(raw) as Policy;
}

export function handlePolicyCheck(args: {
  action: string;
  target?: string;
  policyFile?: string;
}): void {
  const policy = loadPolicy(args.policyFile);
  const engine = new PolicyEngine();

  const agentAction: AgentAction = {
    type: args.action,
    target: args.target,
    timestamp: new Date().toISOString(),
  };

  const decision = engine.evaluate(agentAction, policy);

  console.log("=== Policy Check Result ===");
  console.log(`Action:   ${agentAction.type}`);
  if (agentAction.target) console.log(`Target:   ${agentAction.target}`);
  console.log(`Policy:   ${policy.id} (${policy.name})`);
  console.log(`Decision: ${decision.decision}`);
  console.log(`Reason:   ${decision.reason}`);
  if (decision.matchedRuleId) {
    console.log(`Rule ID:  ${decision.matchedRuleId}`);
  }
}

export function handlePolicyList(policyFile?: string): void {
  const policy = loadPolicy(policyFile);

  console.log(`=== Active Policy: ${policy.name} (${policy.id}) ===`);
  console.log(`Version:          ${policy.version}`);
  console.log(`Default Decision: ${policy.defaultDecision || "DENY"}`);
  console.log(`Allowed Domains:  ${policy.allowedDomains?.join(", ") || "None"}`);
  console.log(`Denied Domains:   ${policy.deniedDomains?.join(", ") || "None"}`);
  console.log(`Sensitive Types:  ${policy.sensitiveActionTypes?.join(", ") || "None"}`);
  console.log("\nConfigured Rules:");
  for (const rule of policy.rules) {
    console.log(
      ` - [${rule.id}] action=${rule.actionType} => ${rule.decision} (${rule.description || "no description"})`
    );
  }
}
