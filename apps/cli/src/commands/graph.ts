import * as fs from "node:fs";
import * as path from "node:path";
import {
  FileSystemGraphStorage,
  GraphTraversalEngine,
  GraphIngestionPipeline,
  GraphVerifier,
} from "@open-agent/graph";

export function getGraphStorage(customPath?: string): FileSystemGraphStorage {
  const basePath = customPath
    ? path.resolve(process.cwd(), customPath)
    : path.resolve(process.cwd(), ".graph-store");
  return new FileSystemGraphStorage(basePath);
}

export async function handleGraphStatus(options: { path?: string } = {}): Promise<void> {
  const storage = getGraphStorage(options.path);
  await storage.load();

  const entities = storage.listEntities();
  const relationships = storage.listRelationships();
  const evidences = storage.listEvidence();
  const manifest = storage.getManifest();

  console.log("=== OpenAgent Knowledge Graph Status ===");
  console.log(`Schema Version:      ${manifest.version}`);
  console.log(`Total Entities:      ${entities.length}`);
  console.log(`Total Relationships: ${relationships.length}`);
  console.log(`Total Evidence:      ${evidences.length}`);
  console.log(`Last Updated:        ${manifest.updated_at}`);

  const typeCounts: Record<string, number> = {};
  for (const ent of entities) {
    typeCounts[ent.entity_type] = (typeCounts[ent.entity_type] || 0) + 1;
  }
  console.log("\nEntity Types Breakdown:");
  for (const [t, count] of Object.entries(typeCounts)) {
    console.log(`  - ${t.padEnd(16)}: ${count}`);
  }
}

export async function handleGraphEntities(
  options: { type?: string; query?: string; limit?: number; path?: string } = {}
): Promise<void> {
  const storage = getGraphStorage(options.path);
  await storage.load();

  let entities = storage.findEntities({
    type: options.type,
    nameQuery: options.query,
  });

  const limit = options.limit || 50;
  const sliced = entities.slice(0, limit);

  console.log(`=== OpenAgent Graph Entities (${sliced.length}/${entities.length}) ===`);
  console.log("ID".padEnd(28) + "Type".padEnd(16) + "Canonical Name".padEnd(30) + "Aliases");
  console.log("-".repeat(90));

  for (const ent of sliced) {
    console.log(
      ent.entity_id.substring(0, 26).padEnd(28) +
        ent.entity_type.padEnd(16) +
        ent.canonical_name.substring(0, 28).padEnd(30) +
        (ent.aliases && ent.aliases.length > 0 ? ent.aliases.join(", ") : "-")
    );
  }
}

export async function handleGraphEntityShow(
  id: string,
  options: { path?: string } = {}
): Promise<void> {
  const storage = getGraphStorage(options.path);
  await storage.load();

  const entity = storage.getEntity(id);
  if (!entity) {
    throw new Error(`Entity not found: ${id}`);
  }

  const outEdges = storage.getOutboundRelationships(id);
  const inEdges = storage.getInboundRelationships(id);

  console.log("=== Entity Details ===");
  console.log(`ID:             ${entity.entity_id}`);
  console.log(`Canonical Name: ${entity.canonical_name}`);
  console.log(`Type:           ${entity.entity_type}`);
  console.log(`Aliases:        ${entity.aliases?.join(", ") || "None"}`);
  console.log(`Created At:     ${entity.created_at}`);
  console.log(`Updated At:     ${entity.updated_at}`);

  if (entity.metadata && Object.keys(entity.metadata).length > 0) {
    console.log(`Metadata:       ${JSON.stringify(entity.metadata)}`);
  }

  console.log(`\nOutgoing Relationships (${outEdges.length}):`);
  if (outEdges.length === 0) {
    console.log("  (None)");
  } else {
    for (const r of outEdges) {
      console.log(`  -[${r.predicate}]-> ${r.object_entity_id} (conf: ${r.confidence})`);
    }
  }

  console.log(`\nIncoming Relationships (${inEdges.length}):`);
  if (inEdges.length === 0) {
    console.log("  (None)");
  } else {
    for (const r of inEdges) {
      console.log(`  <-[${r.predicate}]- ${r.subject_entity_id} (conf: ${r.confidence})`);
    }
  }
}

export async function handleGraphRelationships(
  options: {
    predicate?: string;
    subject?: string;
    object?: string;
    limit?: number;
    path?: string;
  } = {}
): Promise<void> {
  const storage = getGraphStorage(options.path);
  await storage.load();

  let rels = storage.findRelationships({
    predicate: options.predicate,
    subjectId: options.subject,
    objectId: options.object,
  });

  const limit = options.limit || 50;
  const sliced = rels.slice(0, limit);

  console.log(`=== Graph Relationships (${sliced.length}/${rels.length}) ===`);
  console.log(
    "Subject ID".padEnd(26) + "Predicate".padEnd(20) + "Object ID".padEnd(26) + "Confidence"
  );
  console.log("-".repeat(80));

  for (const r of sliced) {
    console.log(
      r.subject_entity_id.substring(0, 24).padEnd(26) +
        r.predicate.padEnd(20) +
        r.object_entity_id.substring(0, 24).padEnd(26) +
        r.confidence.toFixed(2)
    );
  }
}

export async function handleGraphNeighbors(
  id: string,
  options: { depth?: number; path?: string } = {}
): Promise<void> {
  const storage = getGraphStorage(options.path);
  await storage.load();

  const entity = storage.getEntity(id);
  if (!entity) {
    throw new Error(`Target entity not found: ${id}`);
  }

  const engine = new GraphTraversalEngine(storage);
  const depth = options.depth ? Number(options.depth) : 1;
  const result = engine.neighbors(id, { depth });

  console.log(`=== Graph Neighborhood for [${entity.canonical_name}] ===`);
  console.log(`Target ID:            ${entity.entity_id}`);
  console.log(`Depth:                ${depth}`);
  console.log(`Total Connected:      ${result.nodes.length}`);
  console.log(`Total Relationships:  ${result.edges.length}`);

  console.log("\nConnected Entities:");
  for (const n of result.nodes) {
    console.log(`  - [${n.entity_type}] ${n.canonical_name} (${n.entity_id})`);
  }

  console.log("\nTraversed Relationships:");
  for (const r of result.edges) {
    console.log(
      `  - ${r.subject_entity_id} -[${r.predicate}]-> ${r.object_entity_id} (conf: ${r.confidence})`
    );
  }
}

export async function handleGraphPath(
  sourceId: string,
  targetId: string,
  options: { maxDepth?: number; path?: string } = {}
): Promise<void> {
  const storage = getGraphStorage(options.path);
  await storage.load();

  const src = storage.getEntity(sourceId);
  const tgt = storage.getEntity(targetId);

  if (!src) throw new Error(`Source entity not found: ${sourceId}`);
  if (!tgt) throw new Error(`Target entity not found: ${targetId}`);

  const engine = new GraphTraversalEngine(storage);
  const maxDepth = options.maxDepth ? Number(options.maxDepth) : 3;
  const pathResult = engine.findPath(sourceId, targetId, maxDepth);

  console.log(`=== Graph Path Search ===`);
  console.log(`From:      [${src.canonical_name}] (${sourceId})`);
  console.log(`To:        [${tgt.canonical_name}] (${targetId})`);
  console.log(`Max Depth: ${maxDepth}`);

  if (!pathResult.found || pathResult.paths.length === 0) {
    console.log("\nResult: No path found between entities within depth limit.");
    return;
  }

  const bestPath = pathResult.paths[0];
  console.log(`\nResult: Path Found (${bestPath.relationships.length} hops)`);
  for (let i = 0; i < bestPath.relationships.length; i++) {
    const step = bestPath.relationships[i];
    const sEnt = storage.getEntity(step.subject_entity_id);
    const oEnt = storage.getEntity(step.object_entity_id);
    console.log(
      `  [Hop ${i + 1}] ${sEnt?.canonical_name || step.subject_entity_id} --[${step.predicate}]--> ${oEnt?.canonical_name || step.object_entity_id}`
    );
  }
}

export async function handleGraphSearch(
  query: string,
  options: { limit?: number; path?: string } = {}
): Promise<void> {
  const storage = getGraphStorage(options.path);
  await storage.load();

  const limit = options.limit ? Number(options.limit) : 10;
  const results = storage.findEntities({ nameQuery: query }).slice(0, limit);

  console.log(`=== Graph Entity Search Results for "${query}" (${results.length}) ===`);
  if (results.length === 0) {
    console.log("No matching entities found.");
    return;
  }

  for (const ent of results) {
    console.log(`  - [${ent.entity_type}] ${ent.canonical_name} (ID: ${ent.entity_id})`);
    if (ent.aliases && ent.aliases.length > 0) {
      console.log(`    Aliases: ${ent.aliases.join(", ")}`);
    }
  }
}

export async function handleGraphIngest(
  filePath: string,
  options: { path?: string; documentId?: string } = {}
): Promise<void> {
  const resolvedFile = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedFile)) {
    throw new Error(`Document file not found: ${resolvedFile}`);
  }

  const content = fs.readFileSync(resolvedFile, "utf-8");
  const docId = options.documentId || path.basename(filePath);

  const storage = getGraphStorage(options.path);
  await storage.load();

  const pipeline = new GraphIngestionPipeline({ storage });

  console.log(`=== Ingesting Document into Knowledge Graph ===`);
  console.log(`File:        ${resolvedFile}`);
  console.log(`Document ID: ${docId}`);
  console.log(`Length:      ${content.length} characters`);

  const startTime = Date.now();
  const summary = await pipeline.ingest({
    id: docId,
    text: content,
    metadata: { source: filePath },
  });
  await storage.save();
  const duration = Date.now() - startTime;

  console.log(`\n=== Ingestion Complete (${duration}ms) ===`);
  console.log(`Chunks Processed:       ${summary.chunks_count}`);
  console.log(`Entities Created:       ${summary.entities_created}`);
  console.log(`Entities Resolved:      ${summary.entities_resolved}`);
  console.log(`Relationships Created:  ${summary.relationships_created}`);
  console.log(`Evidence Generated:     ${summary.evidence_created}`);
}

export async function handleGraphVerify(options: { path?: string } = {}): Promise<void> {
  const storage = getGraphStorage(options.path);
  await storage.load();

  const verifier = new GraphVerifier(storage);
  const result = verifier.verify();

  console.log("=== Knowledge Graph Verification ===");
  console.log(`Entities Checked:      ${result.total_entities}`);
  console.log(`Relationships Checked: ${result.total_relationships}`);
  console.log(`Evidence Checked:      ${result.total_evidence}`);
  console.log(
    `Status:                ${result.valid ? "PASSED (Consistent)" : "FAILED (Issues Found)"}`
  );

  if (result.issues.length > 0) {
    console.log("\nDetected Issues:");
    for (const issue of result.issues) {
      console.log(`  [!] [${issue.severity}] ${issue.type} (${issue.id}): ${issue.description}`);
    }
  } else {
    console.log("Zero broken edges or orphaned references found.");
  }
}

export async function handleGraphRepair(options: { path?: string } = {}): Promise<void> {
  const storage = getGraphStorage(options.path);
  await storage.load();

  const verifier = new GraphVerifier(storage);
  const result = await verifier.repair();

  console.log("=== Knowledge Graph Repair Complete ===");
  console.log(`Status:            ${result.repaired ? "Repairs Applied" : "No Repairs Needed"}`);
  console.log(`Issues Repaired:   ${result.issues_repaired}`);
  if (result.actions_taken.length > 0) {
    console.log("Actions Taken:");
    for (const a of result.actions_taken) {
      console.log(`  - ${a}`);
    }
  }
}
