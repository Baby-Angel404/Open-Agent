import * as fs from "node:fs";
import * as path from "node:path";
import { Session } from "@open-agent/core";

const SESSION_STORE_FILE = ".audit-logs/sessions.json";

export function loadSessions(): Session[] {
  const fullPath = path.resolve(process.cwd(), SESSION_STORE_FILE);
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
    console.log(`- [${s.id}] Agent: ${s.agentId} Status: ${s.status} Started: ${s.startedAt}`);
  }
}
