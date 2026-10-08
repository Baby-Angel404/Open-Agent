import * as http from "node:http";
import { VectorEngine } from "../engine/engine.js";
import {
  CreateCollectionOptions,
  InsertRecordInput,
  SearchQuery,
  DocumentInput,
  ChunkingConfig,
} from "../types/index.js";

export class VectorAPIHandler {
  private engine: VectorEngine;

  constructor(engine: VectorEngine) {
    this.engine = engine;
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
          // 5MB payload limit
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
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "http://127.0.0.1",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    try {
      // 1. Collections: POST /api/v1/collections
      if (pathname === "/api/v1/collections" && method === "POST") {
        const body = (await this.parseBody(req)) as unknown as CreateCollectionOptions;
        if (!body.name || !body.dimension) {
          return this.sendError(
            res,
            400,
            "BAD_REQUEST",
            "Missing required fields: 'name' and 'dimension'"
          );
        }
        const col = await this.engine.createCollection(body);
        return this.sendJSON(res, 201, { success: true, data: col });
      }

      // GET /api/v1/collections
      if (pathname === "/api/v1/collections" && method === "GET") {
        const list = this.engine.listCollections();
        return this.sendJSON(res, 200, { success: true, data: list });
      }

      // /api/v1/collections/:id
      const colMatch = pathname.match(/^\/api\/v1\/collections\/([^/]+)$/);
      if (colMatch) {
        const colId = colMatch[1];
        if (method === "GET") {
          const col = this.engine.getCollection(colId);
          if (!col) return this.sendError(res, 404, "NOT_FOUND", `Collection '${colId}' not found`);
          return this.sendJSON(res, 200, { success: true, data: col });
        }
        if (method === "DELETE") {
          const deleted = await this.engine.deleteCollection(colId);
          if (!deleted)
            return this.sendError(res, 404, "NOT_FOUND", `Collection '${colId}' not found`);
          return this.sendJSON(res, 200, {
            success: true,
            message: `Collection '${colId}' deleted`,
          });
        }
      }

      // 2. Documents: POST /api/v1/documents (Single Ingestion with chunking)
      if (pathname === "/api/v1/documents" && method === "POST") {
        const body = await this.parseBody(req);
        const collection = String(body.collection || "");
        const doc = body.document as DocumentInput;
        const chunkConfig = body.chunking as ChunkingConfig | undefined;

        if (!collection || !doc || !doc.text) {
          return this.sendError(
            res,
            400,
            "BAD_REQUEST",
            "Missing required fields: 'collection' and 'document.text'"
          );
        }

        const records = await this.engine.ingestDocument(collection, doc, chunkConfig);
        return this.sendJSON(res, 201, {
          success: true,
          data: { inserted_records: records.length, records },
        });
      }

      // POST /api/v1/documents/batch (Direct Records or Chunks Batch Insert)
      if (pathname === "/api/v1/documents/batch" && method === "POST") {
        const body = await this.parseBody(req);
        const collection = String(body.collection || "");
        const records = body.records as InsertRecordInput[];

        if (!collection || !Array.isArray(records)) {
          return this.sendError(
            res,
            400,
            "BAD_REQUEST",
            "Missing required fields: 'collection' and 'records' array"
          );
        }

        const inserted = await this.engine.batchInsert(collection, records);
        return this.sendJSON(res, 201, {
          success: true,
          data: { count: inserted.length, records: inserted },
        });
      }

      // 3. Search: POST /api/v1/search
      if (pathname === "/api/v1/search" && method === "POST") {
        const body = (await this.parseBody(req)) as unknown as SearchQuery;
        if (!body.collection) {
          return this.sendError(res, 400, "BAD_REQUEST", "Missing required field: 'collection'");
        }
        if (!body.query && !body.vector) {
          return this.sendError(
            res,
            400,
            "BAD_REQUEST",
            "Either 'query' text or 'vector' must be provided"
          );
        }

        const searchRes = await this.engine.search(body);
        return this.sendJSON(res, 200, { success: true, data: searchRes });
      }

      // 4. Records: /api/v1/records/:id
      const recordMatch = pathname.match(/^\/api\/v1\/records\/([^/]+)$/);
      if (recordMatch) {
        const recordId = recordMatch[1];
        const collection = parsedUrl.searchParams.get("collection");

        if (!collection) {
          return this.sendError(
            res,
            400,
            "BAD_REQUEST",
            "Query parameter 'collection' is required"
          );
        }

        if (method === "GET") {
          const rec = this.engine.getRecord(collection, recordId);
          if (!rec) return this.sendError(res, 404, "NOT_FOUND", `Record '${recordId}' not found`);
          return this.sendJSON(res, 200, { success: true, data: rec });
        }

        if (method === "DELETE") {
          const deleted = await this.engine.deleteRecord(collection, recordId);
          if (!deleted)
            return this.sendError(res, 404, "NOT_FOUND", `Record '${recordId}' not found`);
          return this.sendJSON(res, 200, {
            success: true,
            message: `Record '${recordId}' deleted`,
          });
        }
      }

      return this.sendError(res, 404, "NOT_FOUND", `Endpoint not found: ${pathname}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.sendError(res, 500, "INTERNAL_ERROR", msg);
    }
  }
}
