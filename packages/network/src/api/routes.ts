import * as http from "node:http";
import { NetworkNode } from "../service/network-node.js";
import { Capability } from "../types/index.js";

export class NetworkAPIHandler {
  private node: NetworkNode;

  constructor(node: NetworkNode) {
    this.node = node;
  }

  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // 1. Network Status
    if (pathname === "/api/v1/network/status" && method === "GET") {
      this.sendJSON(res, 200, { success: true, data: this.node.getStatus() });
      return true;
    }

    // 2. Peers: List
    if (pathname === "/api/v1/peers" && method === "GET") {
      this.sendJSON(res, 200, {
        success: true,
        data: this.node.getPeerManager().listPeers(),
      });
      return true;
    }

    // Peers: Connect/Register
    if (pathname === "/api/v1/peers/connect" && method === "POST") {
      const body = await this.parseBody(req);
      if (!body.agent_id || !body.public_key) {
        this.sendJSON(res, 400, { success: false, error: "Missing agent_id or public_key" });
        return true;
      }
      const peer = this.node.getPeerManager().registerPeer({
        agent_id: String(body.agent_id),
        public_key: String(body.public_key),
        addresses: Array.isArray(body.addresses) ? body.addresses : [],
      });
      this.sendJSON(res, 200, { success: true, data: peer });
      return true;
    }

    // Peers: Inspect / Disconnect / Block / Unblock
    const peerMatch = pathname.match(/^\/api\/v1\/peers\/([^/]+)$/);
    if (peerMatch && method === "GET") {
      const peer = this.node.getPeerManager().getPeer(peerMatch[1]);
      if (!peer) {
        this.sendJSON(res, 404, { success: false, error: "Peer not found" });
        return true;
      }
      this.sendJSON(res, 200, { success: true, data: peer });
      return true;
    }

    const peerBlockMatch = pathname.match(/^\/api\/v1\/peers\/([^/]+)\/block$/);
    if (peerBlockMatch && method === "POST") {
      const body = await this.parseBody(req);
      this.node
        .getPeerManager()
        .blockPeer(peerBlockMatch[1], String(body.reason || "Blocked via API"));
      this.sendJSON(res, 200, { success: true, data: { blocked: true } });
      return true;
    }

    const peerUnblockMatch = pathname.match(/^\/api\/v1\/peers\/([^/]+)\/unblock$/);
    if (peerUnblockMatch && method === "POST") {
      const unblocked = this.node.getPeerManager().unblockPeer(peerUnblockMatch[1]);
      this.sendJSON(res, 200, { success: true, data: { unblocked } });
      return true;
    }

    // 3. Capabilities: List
    if (pathname === "/api/v1/capabilities" && method === "GET") {
      this.sendJSON(res, 200, {
        success: true,
        data: this.node.getCapabilityRegistry().list(),
      });
      return true;
    }

    // Capabilities: Register
    if (pathname === "/api/v1/capabilities" && method === "POST") {
      const body = (await this.parseBody(req)) as unknown as Capability;
      try {
        this.node.registerCapability(body);
        this.sendJSON(res, 201, { success: true, data: body });
      } catch (err: any) {
        this.sendJSON(res, 400, { success: false, error: err.message });
      }
      return true;
    }

    // Capabilities: Search
    if (pathname === "/api/v1/capabilities/search" && method === "POST") {
      const body = await this.parseBody(req);
      const query = String(body.query || "");
      const results = this.node.getCapabilityRegistry().search(query);
      this.sendJSON(res, 200, { success: true, data: results });
      return true;
    }

    // Capabilities: Invoke
    if (pathname === "/api/v1/capabilities/invoke" && method === "POST") {
      const body = await this.parseBody(req);
      try {
        const response = await this.node.invokeRemoteCapability({
          targetAgentId: String(body.targetAgentId),
          capabilityId: String(body.capabilityId),
          capabilityVersion: body.capabilityVersion ? String(body.capabilityVersion) : undefined,
          input: (body.input as Record<string, unknown>) || {},
          dataClassification: (body.dataClassification as any) || "PUBLIC",
          timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : undefined,
        });
        this.sendJSON(res, 200, { success: true, data: response });
      } catch (err: any) {
        this.sendJSON(res, 403, { success: false, error: err.message });
      }
      return true;
    }

    // Capabilities: Inspect / Delete
    const capMatch = pathname.match(/^\/api\/v1\/capabilities\/([^/]+)$/);
    if (capMatch && method === "GET") {
      const cap = this.node.getCapabilityRegistry().get(capMatch[1]);
      if (!cap) {
        this.sendJSON(res, 404, { success: false, error: "Capability not found" });
        return true;
      }
      this.sendJSON(res, 200, { success: true, data: cap });
      return true;
    }

    if (capMatch && method === "DELETE") {
      const removed = this.node.getCapabilityRegistry().unregister(capMatch[1]);
      this.sendJSON(res, 200, { success: true, data: { removed } });
      return true;
    }

    // 4. Reputation: Inspect
    const repMatch = pathname.match(/^\/api\/v1\/reputation\/([^/]+)$/);
    if (repMatch && method === "GET") {
      const record = this.node.getReputationManager().getRecord(repMatch[1]);
      const events = this.node.getReputationManager().getEvents(repMatch[1]);
      this.sendJSON(res, 200, { success: true, data: { record, events } });
      return true;
    }

    return false; // Not handled by network router
  }

  private sendJSON(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
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
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  }
}
