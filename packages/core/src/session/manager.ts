import * as fs from "node:fs";
import * as path from "node:path";
import { Session, SessionStatus, SessionHistoryEntry } from "../types/agent.js";
import { AgentAction } from "../types/action.js";

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private storagePath?: string;

  constructor(storagePath?: string) {
    if (storagePath) {
      this.storagePath = storagePath;
      const dir = path.dirname(storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.loadSessions();
    }
  }

  private loadSessions(): void {
    if (!this.storagePath || !fs.existsSync(this.storagePath)) return;
    try {
      const raw = fs.readFileSync(this.storagePath, "utf-8");
      const list = JSON.parse(raw) as Session[];
      for (const s of list) {
        this.sessions.set(s.id, s);
      }
    } catch {
      // Ignore corrupted store file
    }
  }

  private persist(): void {
    if (!this.storagePath) return;
    try {
      const list = Array.from(this.sessions.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(list, null, 2), "utf-8");
    } catch {
      // Ignore write errors
    }
  }

  createSession(
    task: string,
    agentId = "agent_default",
    metadata?: Record<string, unknown>
  ): Session {
    const id = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    const session: Session = {
      id,
      agentId,
      task,
      status: "CREATED",
      createdAt: now,
      updatedAt: now,
      history: [],
      metadata,
    };
    this.sessions.set(id, session);
    this.persist();
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  updateStatus(id: string, status: SessionStatus): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.status = status;
    s.updatedAt = new Date().toISOString();
    if (status === "COMPLETED" || status === "STOPPED" || status === "FAILED") {
      s.endedAt = new Date().toISOString();
    }
    this.persist();
    return true;
  }

  setPendingAction(id: string, action?: AgentAction): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.pendingAction = action;
    s.updatedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  addHistory(id: string, entry: Omit<SessionHistoryEntry, "step">): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    const step = s.history.length + 1;
    s.history.push({
      ...entry,
      step,
    });
    s.updatedAt = new Date().toISOString();
    this.persist();
    return true;
  }
}
