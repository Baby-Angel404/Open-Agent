import * as fs from "node:fs";
import * as path from "node:path";
import { Session } from "@open-agent/core";

const SESSION_STORE_FILE = ".audit-logs/sessions.json";

export function getSessionStorePath(): string {
  return path.resolve(process.cwd(), SESSION_STORE_FILE);
}

export function loadSessions(): Session[] {
  const fullPath = getSessionStorePath();
  if (!fs.existsSync(fullPath)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf-8")) as Session[];
  } catch {
    return [];
  }
}

export function handleSessionList(): void {
  const sessions = loadSessions();
  console.log(`=== Local Sessions (${sessions.length} tracked) ===`);
  if (sessions.length === 0) {
    console.log("No active or historical sessions recorded in current workspace.");
    return;
  }
  for (const s of sessions) {
    console.log(
      `- [${s.id}] Status: ${s.status.padEnd(20)} Task: "${s.task.substring(0, 40)}" Created: ${s.createdAt}`
    );
  }
}

export function handleSessionShow(sessionId: string): void {
  const sessions = loadSessions();
  const session = sessions.find((s) => s.id === sessionId);

  if (!session) {
    console.error(`Session '${sessionId}' not found.`);
    return;
  }

  console.log(`=== Session Details: ${session.id} ===`);
  console.log(`Task:       ${session.task}`);
  console.log(`Agent ID:   ${session.agentId}`);
  console.log(`Status:     ${session.status}`);
  console.log(`Created:    ${session.createdAt}`);
  console.log(`Updated:    ${session.updatedAt}`);
  if (session.endedAt) console.log(`Ended:      ${session.endedAt}`);
  if (session.pendingAction) {
    console.log(`Pending Action: ${session.pendingAction.type} -> ${session.pendingAction.target}`);
  }

  console.log(`\nExecution History (${session.history?.length || 0} steps):`);
  for (const item of session.history || []) {
    console.log(`  Step ${item.step}: [${item.action.type}] ${item.action.target || ""}`);
    console.log(`    Policy Decision: ${item.decision.decision} - ${item.decision.reason}`);
    if (item.result) {
      console.log(`    Execution:       ${item.result.status}`);
    }
  }
}
