import * as http from "node:http";
import { AgentRuntime } from "../runtime/runtime.js";
import { LocalAuditLogger } from "../audit/logger.js";
import { AppendOnlyAuditStore } from "../audit/store.js";
import { AgentAction } from "../types/action.js";
import { PolicyEngine } from "../policy/engine.js";
import { SessionReplayEngine } from "../replay/engine.js";
import { renderDashboardHtml } from "./ui.js";
import { AuditQueryFilter } from "../types/audit.js";
import { VectorEngine, VectorAPIHandler } from "@open-agent/vector";
import { FileSystemGraphStorage, GraphRAGEngine, GraphAPIHandler } from "@open-agent/graph";

export interface NetworkRouteHandler {
  handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean>;
}

export interface APIServerOptions {
  runtime: AgentRuntime;
  auditLogger?: LocalAuditLogger | AppendOnlyAuditStore;
  vectorEngine?: VectorEngine;
  graphStorage?: FileSystemGraphStorage;
  ragEngine?: GraphRAGEngine;
  networkHandler?: NetworkRouteHandler;
  port?: number;
  host?: string;
  enableDashboard?: boolean;
}

export class LocalAPIServer {
  private server?: http.Server;
  private runtime: AgentRuntime;
  private auditStore: AppendOnlyAuditStore;
  private vectorEngine: VectorEngine;
  private vectorHandler: VectorAPIHandler;
  private graphStorage: FileSystemGraphStorage;
  private ragEngine: GraphRAGEngine;
  private graphHandler: GraphAPIHandler;
  private networkHandler?: NetworkRouteHandler;
  private port: number;
  private host: string;
  private enableDashboard: boolean;
  private replayEngine: SessionReplayEngine;
  private rateLimitWindowMs = 10000;
  private maxRequestsPerWindow = 200;
  private clientRequestCounts: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(options: APIServerOptions) {
    this.runtime = options.runtime;
    this.networkHandler = options.networkHandler;
    this.port = options.port || 4242;
    this.host = options.host || "127.0.0.1"; // Security hardening: bind exclusively to local interface
    this.enableDashboard = options.enableDashboard !== false;
    this.replayEngine = new SessionReplayEngine();
    this.vectorEngine = options.vectorEngine || new VectorEngine();
    this.vectorHandler = new VectorAPIHandler(this.vectorEngine);
    this.graphStorage = options.graphStorage || new FileSystemGraphStorage();
    this.ragEngine =
      options.ragEngine ||
      new GraphRAGEngine({
        storage: this.graphStorage,
        vectorEngine: this.vectorEngine,
      });
    this.graphHandler = new GraphAPIHandler(this.graphStorage, this.ragEngine);

    if (options.auditLogger instanceof AppendOnlyAuditStore) {
      this.auditStore = options.auditLogger;
    } else if (options.auditLogger instanceof LocalAuditLogger) {
      this.auditStore = options.auditLogger.getStore();
    } else {
      this.auditStore = options.runtime.getAuditStore();
    }
  }

  public setNetworkHandler(handler: NetworkRouteHandler): void {
    this.networkHandler = handler;
  }

  public getNetworkHandler(): NetworkRouteHandler | undefined {
    return this.networkHandler;
  }

  private isAllowedHost(host?: string): boolean {
    if (!host) return true;
    try {
      const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
      const lower = hostname.toLowerCase();
      return lower === "localhost" || lower === "127.0.0.1" || lower === "::1";
    } catch {
      return false;
    }
  }

  private isAllowedOrigin(origin?: string): boolean {
    if (!origin) return true; // Direct tools, curl, CLI
    try {
      const u = new URL(origin);
      return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
    } catch {
      return false;
    }
  }

  private checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const client = this.clientRequestCounts.get(ip);
    if (!client || now > client.resetAt) {
      this.clientRequestCounts.set(ip, { count: 1, resetAt: now + this.rateLimitWindowMs });
      return true;
    }
    client.count++;
    return client.count <= this.maxRequestsPerWindow;
  }

  private sendJSON(res: http.ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "http://127.0.0.1",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    res.end(JSON.stringify(data));
  }

  private sendHTML(res: http.ServerResponse, statusCode: number, html: string): void {
    res.writeHead(statusCode, {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    res.end(html);
  }

  private parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) {
          // 2MB limit
          req.destroy(new Error("Request payload too large"));
        }
      });
      req.on("end", () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body) as Record<string, unknown>);
        } catch {
          reject(new Error("Invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  }

  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const host = req.headers.host;
    if (host && !this.isAllowedHost(host)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden: Invalid Host header rejected by local security boundary");
      return;
    }

    const origin = req.headers.origin;
    if (origin && !this.isAllowedOrigin(origin)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden: External origin rejected by local security boundary");
      return;
    }

    const clientIp = req.socket.remoteAddress || "127.0.0.1";
    if (!this.checkRateLimit(clientIp)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ success: false, error: "Rate limit exceeded on local API endpoint" })
      );
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": origin || "http://127.0.0.1",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    try {
      // Vector Engine routes
      if (
        pathname.startsWith("/api/v1/collections") ||
        pathname.startsWith("/api/v1/documents") ||
        pathname === "/api/v1/search" ||
        pathname.startsWith("/api/v1/records")
      ) {
        return await this.vectorHandler.handleRequest(req, res);
      }

      // Graph & Graph RAG Engine routes
      if (pathname.startsWith("/api/v1/graph") || pathname.startsWith("/api/v1/rag")) {
        return await this.graphHandler.handleRequest(req, res);
      }

      // Decentralized Network & Capability routes
      if (
        pathname.startsWith("/api/v1/network") ||
        pathname.startsWith("/api/v1/peers") ||
        pathname.startsWith("/api/v1/capabilities") ||
        pathname.startsWith("/api/v1/reputation")
      ) {
        if (this.networkHandler) {
          const handled = await this.networkHandler.handleRequest(req, res);
          if (handled) return;
        } else {
          return this.sendJSON(res, 503, {
            success: false,
            error: "Network node is not initialized on this API server instance",
          });
        }
      }

      // 0. Dashboard & Health
      if ((pathname === "/" || pathname === "/dashboard") && method === "GET") {
        if (!this.enableDashboard) {
          return this.sendJSON(res, 404, { success: false, error: "Dashboard disabled" });
        }
        return this.sendHTML(res, 200, renderDashboardHtml());
      }

      if (pathname === "/health" && method === "GET") {
        const metrics = this.runtime.getMetrics();
        const health = metrics.getHealth();
        return this.sendJSON(res, 200, {
          status: health.status,
          uptime: metrics.getSnapshot().uptimeSeconds,
          reasons: health.reasons,
          version: "0.1.0",
        });
      }

      // 1. /api/v1/metrics
      if (pathname === "/api/v1/metrics" && method === "GET") {
        return this.sendJSON(res, 200, {
          success: true,
          data: this.runtime.getMetrics().getSnapshot(),
        });
      }

      // 2. /api/v1/agents
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

      // 3. /api/v1/sessions
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

      // /api/v1/sessions/:id/timeline (Deterministic Replay)
      const timelineMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/timeline$/);
      if (timelineMatch && method === "GET") {
        const sessionId = timelineMatch[1];
        const entries = this.auditStore.getEntries();
        const report = this.replayEngine.replaySession(sessionId, entries);
        return this.sendJSON(res, 200, { success: true, data: report });
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

      // 4. /api/v1/actions/evaluate
      if (pathname === "/api/v1/actions/evaluate" && method === "POST") {
        const body = await this.parseBody(req);
        const action = body.action as AgentAction;
        const engine = new PolicyEngine();
        const decision = engine.evaluate(action, this.runtime.getPolicy());
        return this.sendJSON(res, 200, { success: true, data: decision });
      }

      // 5. /api/v1/policies
      if (pathname === "/api/v1/policies" && method === "GET") {
        return this.sendJSON(res, 200, {
          success: true,
          data: this.runtime.getPolicy(),
        });
      }

      // 6. /api/v1/audit/verify
      if (pathname === "/api/v1/audit/verify" && method === "POST") {
        const verification = this.auditStore.verifyIntegrity();
        return this.sendJSON(res, 200, {
          success: true,
          data: verification,
        });
      }

      // 7. /api/v1/audit/export
      if (pathname === "/api/v1/audit/export" && method === "GET") {
        const sessionId = parsedUrl.searchParams.get("sessionId");
        if (!sessionId) {
          return this.sendJSON(res, 400, {
            success: false,
            error: "Missing required 'sessionId' query parameter",
          });
        }
        const bundle = this.auditStore.exportSession(sessionId);
        return this.sendJSON(res, 200, { success: true, data: bundle });
      }

      // 8. /api/v1/audit (with search and filters)
      if (pathname === "/api/v1/audit" && method === "GET") {
        const sessionId = parsedUrl.searchParams.get("sessionId") || undefined;
        const eventType = parsedUrl.searchParams.get("eventType") || undefined;
        const textSearch = parsedUrl.searchParams.get("q") || undefined;
        const limitStr = parsedUrl.searchParams.get("limit");
        const limit = limitStr ? parseInt(limitStr, 10) : undefined;

        const filter: AuditQueryFilter = {
          sessionId,
          eventType: eventType as any,
          textSearch,
          limit,
        };

        const entries = this.auditStore.query(filter);
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

  async listen(port = this.port): Promise<number> {
    await this.vectorEngine.init();
    await this.graphStorage.load();
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });
      this.server.listen(port, this.host, () => {
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
