import test from "node:test";
import assert from "node:assert";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { FileSystemGraphStorage } from "../storage/graph-storage.js";
import { GraphTraversalEngine } from "../traversal/traversal.js";
import { Entity, Relationship } from "../types/index.js";

test("GraphTraversalEngine executes depth-bounded traversal and handles cycles safely", async () => {
  const tmpDir = path.join(os.tmpdir(), `graph_trav_test_${Date.now()}`);
  const storage = new FileSystemGraphStorage(tmpDir);

  // Graph topology with a cycle: A -> B -> C -> A, and C -> D
  const entities: Entity[] = ["A", "B", "C", "D"].map((name) => ({
    entity_id: `ent_${name.toLowerCase()}`,
    canonical_name: name,
    entity_type: "CONCEPT",
    aliases: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  for (const e of entities) await storage.createEntity(e);

  const relationships: Relationship[] = [
    {
      relationship_id: "rel_ab",
      subject_entity_id: "ent_a",
      predicate: "LINKS_TO",
      object_entity_id: "ent_b",
      confidence: 1.0,
      evidence_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      relationship_id: "rel_bc",
      subject_entity_id: "ent_b",
      predicate: "LINKS_TO",
      object_entity_id: "ent_c",
      confidence: 1.0,
      evidence_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      relationship_id: "rel_ca",
      subject_entity_id: "ent_c",
      predicate: "LINKS_TO",
      object_entity_id: "ent_a", // Cycle back to A
      confidence: 1.0,
      evidence_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      relationship_id: "rel_cd",
      subject_entity_id: "ent_c",
      predicate: "LINKS_TO",
      object_entity_id: "ent_d",
      confidence: 1.0,
      evidence_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  for (const r of relationships) await storage.createRelationship(r);

  const traversal = new GraphTraversalEngine(storage);

  // Depth 1 from A (outbound)
  const d1 = traversal.neighbors("ent_a", { depth: 1, direction: "out" });
  assert.strictEqual(d1.nodes.length, 2); // Center A + B
  assert.ok(d1.nodes.some((n) => n.canonical_name === "B"));

  // Depth 2 from A (outbound) -> A, B, C
  const d2 = traversal.neighbors("ent_a", { depth: 2, direction: "out" });
  assert.strictEqual(d2.nodes.length, 3); // Center A + B + C

  // Depth 3 from A with cycle -> should reach D without infinite loop
  const d3 = traversal.neighbors("ent_a", { depth: 3, direction: "out" });
  assert.strictEqual(d3.nodes.length, 4); // A, B, C, D

  // Shortest path between A and D
  const pathRes = traversal.findPath("ent_a", "ent_d", 4);
  assert.strictEqual(pathRes.found, true);
  assert.strictEqual(pathRes.paths.length > 0, true);
  const bestPath = pathRes.paths[0];
  assert.strictEqual(bestPath.entities.map((e) => e.canonical_name).join("->"), "A->B->C->D");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("GraphTraversalEngine enforces node and depth limits", async () => {
  const tmpDir = path.join(os.tmpdir(), `graph_limits_test_${Date.now()}`);
  const storage = new FileSystemGraphStorage(tmpDir);

  const eCenter: Entity = {
    entity_id: "center",
    canonical_name: "Center",
    entity_type: "CONCEPT",
    aliases: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await storage.createEntity(eCenter);

  // Fan-out to 20 nodes
  for (let i = 0; i < 20; i++) {
    const e: Entity = {
      entity_id: `leaf_${i}`,
      canonical_name: `Leaf ${i}`,
      entity_type: "CONCEPT",
      aliases: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await storage.createEntity(e);
    await storage.createRelationship({
      relationship_id: `rel_${i}`,
      subject_entity_id: "center",
      predicate: "BRANCH",
      object_entity_id: `leaf_${i}`,
      confidence: 1.0,
      evidence_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const traversal = new GraphTraversalEngine(storage);

  // Limit max_nodes to 5
  const res = traversal.neighbors("center", {
    depth: 1,
    limits: { max_nodes: 5 },
  });

  assert.strictEqual(res.nodes.length <= 5, true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
