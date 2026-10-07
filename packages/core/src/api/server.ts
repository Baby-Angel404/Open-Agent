import * as http from "node:http";
import { AgentRuntime } from "../runtime/runtime.js";
import { LocalAuditLogger } from "../audit/logger.js";
import { AgentAction } from "../types/action.js";
import { PolicyEngine } from "../policy/engine.js";

export interface APIServerOptions {
  runtime: AgentRuntime;
  auditLogger?: LocalAuditLogger;
  port?: number;
}

export class LocalAPIServer {
  private server?: http.Server;
  private runtime: AgentRuntime;
  private auditLogger?: LocalAuditLogger;
  private port: number;

  constructor(options: APIServerOptions) {
    this.runtime = options.runtime;
    this.auditLogger = options.auditLogger;
    this.port = options.port || 4242;
  }

  private sendJSON(res: http.ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end(JSON.stringify(data));
  }

  private parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body) as Record<string, unknown>);
        } catch (err) {
          reject(new Error("Invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  }

  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    try {
      // 1. /api/v1/agents
      if (pathname === "/api/v1/agents" && method === "GET") {
        return this.sendJSON(res, 200, {
          success: true,
          data: [
            {
              id: "agent_local",
              name: "Local Autonomous Policy Agent",
              version: "0.1.0",
              status: "IDLE",
            },
          ],
        });
      }

      // 2. /api/v1/sessions
      if (pathname === "/api/v1/sessions" && method === "GET") {
        return this.sendJSON(res, 200, {
          success: true,
          data: this.runtime.listSessions(),
        });
      }

      if (pathname === "/api/v1/sessions" && method === "POST") {
        const body = await this.parseBody(req);
        const task = String(body.task || "");
        if (!task) {
          return this.sendJSON(res, 400, {
            success: false,
            error: "Missing required 'task' field",
          });
        }
        const session = this.runtime.startSession(task, String(body.agentId || "agent_local"));
        return this.sendJSON(res, 201, { success: true, data: session });
      }

      // /api/v1/sessions/:id
      const sessionMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
      if (sessionMatch && method === "GET") {
        const session = this.runtime.getSession(sessionMatch[1]);
        if (!session) {
          return this.sendJSON(res, 404, { success: false, error: "Session not found" });
        }
        return this.sendJSON(res, 200, { success: true, data: session });
      }

      // /api/v1/sessions/:id/step
      const stepMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/step$/);
      if (stepMatch && method === "POST") {
        const stepRes = await this.runtime.step(stepMatch[1]);
        return this.sendJSON(res, 200, { success: true, data: stepRes });
      }

      // /api/v1/sessions/:id/stop
      const stopMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/stop$/);
      if (stopMatch && method === "POST") {
        const body = await this.parseBody(req);
        const stopped = this.runtime.emergencyStop(
          stopMatch[1],
          String(body.reason || "Emergency stop")
        );
        return this.sendJSON(res, 200, { success: true, data: stopped });
      }

      // /api/v1/sessions/:id/approval
      const approvalMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/approval$/);
      if (approvalMatch && method === "POST") {
        const body = await this.parseBody(req);
        const respType = body.response as "APPROVE" | "DENY" | "CANCEL_SESSION";
        if (!["APPROVE", "DENY", "CANCEL_SESSION"].includes(respType)) {
          return this.sendJSON(res, 400, { success: false, error: "Invalid response type" });
        }
        const approvalRes = await this.runtime.respondToApproval(approvalMatch[1], respType);
        return this.sendJSON(res, 200, { success: true, data: approvalRes });
      }

      // 3. /api/v1/actions/evaluate
      if (pathname === "/api/v1/actions/evaluate" && method === "POST") {
        const body = await this.parseBody(req);
        const action = body.action as AgentAction;
        const engine = new PolicyEngine();
        const decision = engine.evaluate(action, this.runtime.getPolicy());
        return this.sendJSON(res, 200, { success: true, data: decision });
      }

      // 4. /api/v1/policies
      if (pathname === "/api/v1/policies" && method === "GET") {
        return this.sendJSON(res, 200, {
          success: true,
          data: this.runtime.getPolicy(),
        });
      }

      // 5. /api/v1/audit
      if (pathname === "/api/v1/audit" && method === "GET") {
        const entries = this.auditLogger ? this.auditLogger.getEntries() : [];
        return this.sendJSON(res, 200, {
          success: true,
          data: entries,
        });
      }

      return this.sendJSON(res, 404, { success: false, error: `Endpoint not found: ${pathname}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.sendJSON(res, 500, { success: false, error: msg });
    }
  }

  listen(port = this.port): Promise<number> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });
      this.server.listen(port, () => {
        const actualPort = (this.server?.address() as { port: number })?.port || port;
        resolve(actualPort);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
