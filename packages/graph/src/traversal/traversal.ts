import { performance } from "node:perf_hooks";
import {
  Entity,
  Relationship,
  Evidence,
  NeighborOptions,
  TraversalResult,
  PathResult,
  TraversalLimits,
} from "../types/index.js";
import { IGraphStorage } from "../storage/graph-storage.js";

export const DEFAULT_TRAVERSAL_LIMITS: Required<TraversalLimits> = {
  max_depth: 2,
  max_nodes: 200,
  max_edges: 500,
  timeout_ms: 3000,
};

export class GraphTraversalTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Graph traversal timed out after ${timeoutMs}ms (safeguard limit exceeded)`);
    this.name = "GraphTraversalTimeoutError";
  }
}

export class GraphTraversalLimitExceededError extends Error {
  constructor(message: string) {
    super(`Graph traversal limit reached: ${message}`);
    this.name = "GraphTraversalLimitExceededError";
  }
}

export class GraphTraversalEngine {
  private storage: IGraphStorage;
  private defaultLimits: Required<TraversalLimits>;

  constructor(storage: IGraphStorage, defaultLimits: Partial<TraversalLimits> = {}) {
    this.storage = storage;
    this.defaultLimits = {
      ...DEFAULT_TRAVERSAL_LIMITS,
      ...defaultLimits,
    };
  }

  neighbors(entityId: string, options: NeighborOptions = {}): TraversalResult {
    const center = this.storage.getEntity(entityId);
    if (!center) {
      throw new Error(`Entity '${entityId}' not found`);
    }

    const maxDepth = Math.min(options.depth ?? this.defaultLimits.max_depth, 5);
    const maxNodes = options.limits?.max_nodes ?? this.defaultLimits.max_nodes;
    const maxEdges = options.limits?.max_edges ?? this.defaultLimits.max_edges;
    const timeoutMs = options.limits?.timeout_ms ?? this.defaultLimits.timeout_ms;
    const direction = options.direction ?? "both";
    const allowedPreds = options.relationship_types
      ? new Set(options.relationship_types.map((p) => p.toUpperCase()))
      : undefined;

    const startTime = performance.now();
    const visitedEntities = new Set<string>([entityId]);
    const collectedEdges = new Map<string, Relationship>();
    const collectedNodes = new Map<string, Entity>([[entityId, center]]);

    // BFS queue: [entityId, currentDepth]
    let queue: Array<{ id: string; depth: number }> = [{ id: entityId, depth: 0 }];

    while (queue.length > 0) {
      if (performance.now() - startTime > timeoutMs) {
        throw new GraphTraversalTimeoutError(timeoutMs);
      }

      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      let edgesToFollow: Relationship[] = [];
      if (direction === "out" || direction === "both") {
        edgesToFollow.push(...this.storage.getOutboundRelationships(current.id));
      }
      if (direction === "in" || direction === "both") {
        edgesToFollow.push(...this.storage.getInboundRelationships(current.id));
      }

      for (const edge of edgesToFollow) {
        if (allowedPreds && !allowedPreds.has(edge.predicate.toUpperCase())) {
          continue;
        }

        if (collectedEdges.size >= maxEdges) break;
        collectedEdges.set(edge.relationship_id, edge);

        const targetId =
          edge.subject_entity_id === current.id ? edge.object_entity_id : edge.subject_entity_id;

        if (!visitedEntities.has(targetId)) {
          if (collectedNodes.size >= maxNodes) break;
          visitedEntities.add(targetId);

          const targetNode = this.storage.getEntity(targetId);
          if (targetNode) {
            collectedNodes.set(targetId, targetNode);
            queue.push({ id: targetId, depth: current.depth + 1 });
          }
        }
      }
    }

    // Collect evidence for all collected edges
    const evidenceSet = new Map<string, Evidence>();
    for (const edge of collectedEdges.values()) {
      for (const evId of edge.evidence_ids) {
        const ev = this.storage.getEvidence(evId);
        if (ev) evidenceSet.set(evId, ev);
      }
    }

    return {
      center_entity: center,
      nodes: Array.from(collectedNodes.values()),
      edges: Array.from(collectedEdges.values()),
      evidence: Array.from(evidenceSet.values()),
    };
  }

  findPath(
    startEntityId: string,
    endEntityId: string,
    maxDepth = 3,
    allowedPredicates?: string[]
  ): PathResult {
    const start = this.storage.getEntity(startEntityId);
    const end = this.storage.getEntity(endEntityId);
    if (!start || !end) {
      return { found: false, paths: [] };
    }

    if (startEntityId === endEntityId) {
      return {
        found: true,
        paths: [{ entities: [start], relationships: [] }],
      };
    }

    const depthCap = Math.min(maxDepth, 5);
    const allowed = allowedPredicates
      ? new Set(allowedPredicates.map((p) => p.toUpperCase()))
      : undefined;

    // Queue of paths: { nodeIds: string[], edgeIds: string[] }
    const queue: Array<{ nodeIds: string[]; edgeIds: string[] }> = [
      { nodeIds: [startEntityId], edgeIds: [] },
    ];
    const visited = new Set<string>([startEntityId]);
    const foundPaths: Array<{ entities: Entity[]; relationships: Relationship[] }> = [];

    const startTime = performance.now();

    while (queue.length > 0) {
      if (performance.now() - startTime > this.defaultLimits.timeout_ms) {
        break; // Return paths found so far
      }

      const cur = queue.shift()!;
      const lastNodeId = cur.nodeIds[cur.nodeIds.length - 1];

      if (cur.nodeIds.length - 1 >= depthCap) continue;

      const edges = this.storage.getOutboundRelationships(lastNodeId);
      for (const e of edges) {
        if (allowed && !allowed.has(e.predicate.toUpperCase())) continue;

        const nextNodeId = e.object_entity_id;

        if (nextNodeId === endEntityId) {
          // Path reached!
          const allNodeIds = [...cur.nodeIds, nextNodeId];
          const allEdgeIds = [...cur.edgeIds, e.relationship_id];

          const entities = allNodeIds
            .map((id) => this.storage.getEntity(id))
            .filter((x): x is Entity => x !== undefined);
          const relationships = allEdgeIds
            .map((id) => this.storage.getRelationship(id))
            .filter((x): x is Relationship => x !== undefined);

          foundPaths.push({ entities, relationships });
          if (foundPaths.length >= 5) {
            return { found: true, paths: foundPaths };
          }
        } else if (!visited.has(nextNodeId)) {
          visited.add(nextNodeId);
          queue.push({
            nodeIds: [...cur.nodeIds, nextNodeId],
            edgeIds: [...cur.edgeIds, e.relationship_id],
          });
        }
      }
    }

    return {
      found: foundPaths.length > 0,
      paths: foundPaths,
    };
  }

  relatedEntities(entityId: string, maxDepth = 2): Entity[] {
    const res = this.neighbors(entityId, { depth: maxDepth, direction: "both" });
    return res.nodes.filter((n) => n.entity_id !== entityId);
  }

  relatedDocuments(entityId: string): string[] {
    return this.storage.getDocumentsForEntity(entityId);
  }
}
