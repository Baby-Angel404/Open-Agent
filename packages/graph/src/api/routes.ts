import * as http from "node:http";
import { IGraphStorage } from "../storage/graph-storage.js";
import { GraphTraversalEngine } from "../traversal/traversal.js";
import { GraphRAGEngine } from "../rag/engine.js";
import { GraphVerifier } from "../consistency/verifier.js";
import { Entity, Relationship, RAGQueryRequest } from "../types/index.js";

export class GraphAPIHandler {
  private storage: IGraphStorage;
  private traversal: GraphTraversalEngine;
  private ragEngine: GraphRAGEngine;
  private verifier: GraphVerifier;

  constructor(storage: IGraphStorage, ragEngine: GraphRAGEngine, traversal?: GraphTraversalEngine) {
    this.storage = storage;
    this.ragEngine = ragEngine;
    this.traversal = traversal || new GraphTraversalEngine(this.storage);
    this.verifier = new GraphVerifier(this.storage);
  }

  private sendJSON(res: http.ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "http://127.0.0.1",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    res.end(JSON.stringify(data));
  }

  private sendError(
    res: http.ServerResponse,
    statusCode: number,
    code: string,
    message: string
  ): void {
    this.sendJSON(res, statusCode, {
      success: false,
      error: { code, message },
    });
  }

  private parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) {
          req.destroy(new Error("Payload too large"));
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
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = url.pathname;
    const method = req.method;

    try {
      // 1. RAG Query API: POST /api/v1/rag/query
      if (pathname === "/api/v1/rag/query" && method === "POST") {
        const body = (await this.parseBody(req)) as unknown as RAGQueryRequest;
        if (!body.query) {
          return this.sendError(res, 400, "MISSING_QUERY", "'query' is required");
        }
        const response = await this.ragEngine.query(body);
        return this.sendJSON(res, 200, { success: true, data: response });
      }

      // 2. Graph Consistency APIs: /api/v1/graph/verify & /api/v1/graph/repair
      if (pathname === "/api/v1/graph/verify" && (method === "GET" || method === "POST")) {
        const result = this.verifier.verify();
        return this.sendJSON(res, 200, { success: true, data: result });
      }
      if (pathname === "/api/v1/graph/repair" && method === "POST") {
        const result = await this.verifier.repair();
        return this.sendJSON(res, 200, { success: true, data: result });
      }

      // 3. Graph Traversal APIs
      if (pathname === "/api/v1/graph/traverse" && method === "POST") {
        const body = (await this.parseBody(req)) as any;
        if (!body.entity_id) {
          return this.sendError(res, 400, "MISSING_PARAM", "'entity_id' is required");
        }
        const result = this.traversal.neighbors(String(body.entity_id), {
          depth: body.depth,
          direction: body.direction,
          relationship_types: body.relationship_types,
          limits: body.limits,
        });
        return this.sendJSON(res, 200, { success: true, data: result });
      }

      if (pathname === "/api/v1/graph/query" && method === "POST") {
        const body = (await this.parseBody(req)) as any;
        if (body.entity) {
          const match = this.storage.findEntities({ nameQuery: String(body.entity) })[0];
          if (!match) {
            return this.sendJSON(res, 200, {
              success: true,
              data: { nodes: [], edges: [], evidence: [] },
            });
          }
          const result = this.traversal.neighbors(match.entity_id, {
            depth: body.depth || 1,
            relationship_types: body.relationship_types,
            limits: { max_nodes: body.max_nodes },
          });
          return this.sendJSON(res, 200, { success: true, data: result });
        }
        const entities = this.storage.findEntities({
          type: body.entity_type,
          nameQuery: body.name,
        });
        return this.sendJSON(res, 200, { success: true, data: { entities } });
      }

      // 4. Entity APIs: /api/v1/graph/entities
      if (pathname === "/api/v1/graph/entities" && method === "GET") {
        const type = url.searchParams.get("type") || undefined;
        const q = url.searchParams.get("q") || undefined;
        const alias = url.searchParams.get("alias") || undefined;
        const entities = this.storage.findEntities({ type, nameQuery: q, alias });
        return this.sendJSON(res, 200, { success: true, data: entities });
      }

      if (pathname === "/api/v1/graph/entities" && method === "POST") {
        const body = (await this.parseBody(req)) as unknown as Entity;
        if (!body.entity_id || !body.canonical_name || !body.entity_type) {
          return this.sendError(
            res,
            400,
            "INVALID_ENTITY",
            "entity_id, canonical_name, and entity_type are required"
          );
        }
        await this.storage.createEntity(body);
        return this.sendJSON(res, 201, { success: true, data: body });
      }

      // Entity sub-routes: /api/v1/graph/entities/:id/*
      const entityMatch = pathname.match(/^\/api\/v1\/graph\/entities\/([^/]+)(.*)$/);
      if (entityMatch) {
        const entityId = decodeURIComponent(entityMatch[1]);
        const subPath = entityMatch[2];

        if (subPath === "/neighbors" && method === "GET") {
          const depth = url.searchParams.get("depth")
            ? parseInt(url.searchParams.get("depth")!, 10)
            : 1;
          const result = this.traversal.neighbors(entityId, { depth });
          return this.sendJSON(res, 200, { success: true, data: result });
        }

        if (subPath === "/evidence" && method === "GET") {
          const evidence = this.storage.getEvidenceForEntity(entityId);
          return this.sendJSON(res, 200, { success: true, data: evidence });
        }

        if (subPath === "" || subPath === "/") {
          if (method === "GET") {
            const entity = this.storage.getEntity(entityId);
            if (!entity)
              return this.sendError(res, 404, "NOT_FOUND", `Entity '${entityId}' not found`);
            return this.sendJSON(res, 200, { success: true, data: entity });
          }
          if (method === "DELETE") {
            const ok = await this.storage.deleteEntity(entityId);
            if (!ok) return this.sendError(res, 404, "NOT_FOUND", `Entity '${entityId}' not found`);
            return this.sendJSON(res, 200, { success: true, data: { deleted: true } });
          }
        }
      }

      // 5. Relationship APIs: /api/v1/graph/relationships
      if (pathname === "/api/v1/graph/relationships" && method === "GET") {
        const predicate = url.searchParams.get("predicate") || undefined;
        const subject = url.searchParams.get("subject") || undefined;
        const object = url.searchParams.get("object") || undefined;
        const rels = this.storage.findRelationships({
          predicate,
          subjectId: subject,
          objectId: object,
        });
        return this.sendJSON(res, 200, { success: true, data: rels });
      }

      if (pathname === "/api/v1/graph/relationships" && method === "POST") {
        const body = (await this.parseBody(req)) as unknown as Relationship;
        if (
          !body.relationship_id ||
          !body.subject_entity_id ||
          !body.predicate ||
          !body.object_entity_id
        ) {
          return this.sendError(
            res,
            400,
            "INVALID_RELATIONSHIP",
            "relationship_id, subject_entity_id, predicate, object_entity_id required"
          );
        }
        await this.storage.createRelationship(body);
        return this.sendJSON(res, 201, { success: true, data: body });
      }

      const relMatch = pathname.match(/^\/api\/v1\/graph\/relationships\/([^/]+)$/);
      if (relMatch) {
        const relId = decodeURIComponent(relMatch[1]);
        if (method === "GET") {
          const rel = this.storage.getRelationship(relId);
          if (!rel)
            return this.sendError(res, 404, "NOT_FOUND", `Relationship '${relId}' not found`);
          return this.sendJSON(res, 200, { success: true, data: rel });
        }
        if (method === "DELETE") {
          const ok = await this.storage.deleteRelationship(relId);
          if (!ok)
            return this.sendError(res, 404, "NOT_FOUND", `Relationship '${relId}' not found`);
          return this.sendJSON(res, 200, { success: true, data: { deleted: true } });
        }
      }

      return this.sendError(res, 404, "ENDPOINT_NOT_FOUND", `Route not found: ${pathname}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.sendError(res, 500, "INTERNAL_ERROR", msg);
    }
  }
}
