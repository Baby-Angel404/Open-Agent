import { Session } from "../types/agent.js";

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  createSession(agentId: string, metadata?: Record<string, unknown>): Session {
    const id = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const session: Session = {
      id,
      agentId,
      status: "ACTIVE",
      startedAt: new Date().toISOString(),
      metadata,
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  terminateSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.status = "TERMINATED";
    session.endedAt = new Date().toISOString();
    return true;
  }
}
