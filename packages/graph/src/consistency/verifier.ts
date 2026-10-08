import {
  GraphVerificationResult,
  GraphVerificationIssue,
  GraphRepairResult,
  Relationship,
} from "../types/index.js";
import { IGraphStorage } from "../storage/graph-storage.js";

export class GraphVerifier {
  private storage: IGraphStorage;

  constructor(storage: IGraphStorage) {
    this.storage = storage;
  }

  verify(): GraphVerificationResult {
    const issues: GraphVerificationIssue[] = [];

    const entities = this.storage.listEntities();
    const relationships = this.storage.listRelationships();
    const allEvidence = this.storage.listEvidence();
    const entityIdSet = new Set(entities.map((e) => e.entity_id));
    const evidenceIdSet = new Set(allEvidence.map((e) => e.evidence_id));

    // 1. Verify Relationships (Subject/Object existence & Evidence existence)
    const seenEdges = new Set<string>();

    for (const r of relationships) {
      if (!entityIdSet.has(r.subject_entity_id)) {
        issues.push({
          type: "INVALID_REFERENCE",
          id: r.relationship_id,
          description: `Relationship references nonexistent subject entity '${r.subject_entity_id}'`,
          severity: "HIGH",
        });
      }

      if (!entityIdSet.has(r.object_entity_id)) {
        issues.push({
          type: "INVALID_REFERENCE",
          id: r.relationship_id,
          description: `Relationship references nonexistent object entity '${r.object_entity_id}'`,
          severity: "HIGH",
        });
      }

      // Check evidence references
      if (!r.evidence_ids || r.evidence_ids.length === 0) {
        issues.push({
          type: "MISSING_EVIDENCE",
          id: r.relationship_id,
          description: `Relationship '${r.relationship_id}' has no backing evidence records`,
          severity: "MEDIUM",
        });
      } else {
        for (const evId of r.evidence_ids) {
          if (!evidenceIdSet.has(evId)) {
            issues.push({
              type: "MISSING_EVIDENCE",
              id: r.relationship_id,
              description: `Relationship references missing evidence '${evId}'`,
              severity: "MEDIUM",
            });
          }
        }
      }

      // Check duplicates
      const edgeKey = `${r.subject_entity_id}:${r.predicate.toUpperCase()}:${r.object_entity_id}`;
      if (seenEdges.has(edgeKey)) {
        issues.push({
          type: "DUPLICATE_RELATIONSHIP",
          id: r.relationship_id,
          description: `Duplicate relationship between '${r.subject_entity_id}' and '${r.object_entity_id}' with predicate '${r.predicate}'`,
          severity: "LOW",
        });
      } else {
        seenEdges.add(edgeKey);
      }
    }

    // 2. Check for isolated orphan entities
    for (const e of entities) {
      const rels = this.storage.getAllRelationshipsForEntity(e.entity_id);
      const mentions = this.storage.getMentionsForEntity(e.entity_id);
      if (rels.length === 0 && mentions.length === 0) {
        issues.push({
          type: "ORPHAN_ENTITY",
          id: e.entity_id,
          description: `Entity '${e.canonical_name}' (${e.entity_id}) is detached from relationships and mentions`,
          severity: "LOW",
        });
      }
    }

    let totalMentions = 0;
    for (const e of entities) {
      totalMentions += this.storage.getMentionsForEntity(e.entity_id).length;
    }

    return {
      valid: issues.filter((i) => i.severity === "HIGH").length === 0,
      total_entities: entities.length,
      total_relationships: relationships.length,
      total_evidence: allEvidence.length,
      total_mentions: totalMentions,
      issues,
    };
  }

  async repair(): Promise<GraphRepairResult> {
    const report = this.verify();
    const actionsTaken: string[] = [];
    let repairedCount = 0;

    const entities = this.storage.listEntities();
    const entityIdSet = new Set(entities.map((e) => e.entity_id));
    const allEvidence = this.storage.listEvidence();
    const evidenceIdSet = new Set(allEvidence.map((e) => e.evidence_id));

    // 1. Repair invalid relationships (broken subject/object)
    for (const r of this.storage.listRelationships()) {
      if (!entityIdSet.has(r.subject_entity_id) || !entityIdSet.has(r.object_entity_id)) {
        await this.storage.deleteRelationship(r.relationship_id);
        actionsTaken.push(
          `Deleted broken relationship '${r.relationship_id}' (missing subject or object entity)`
        );
        repairedCount++;
        continue;
      }

      // Clean invalid evidence IDs from relationship
      const validEvIds = r.evidence_ids.filter((id) => evidenceIdSet.has(id));
      if (validEvIds.length !== r.evidence_ids.length) {
        r.evidence_ids = validEvIds;
        await this.storage.updateRelationship(r);
        actionsTaken.push(
          `Pruned missing evidence references from relationship '${r.relationship_id}'`
        );
        repairedCount++;
      }
    }

    // 2. Deduplicate relationships
    const edgeMap = new Map<string, Relationship>();
    for (const r of this.storage.listRelationships()) {
      const edgeKey = `${r.subject_entity_id}:${r.predicate.toUpperCase()}:${r.object_entity_id}`;
      const existing = edgeMap.get(edgeKey);
      if (existing) {
        // Merge evidence and delete duplicate
        const mergedEv = Array.from(new Set([...existing.evidence_ids, ...r.evidence_ids]));
        existing.evidence_ids = mergedEv;
        existing.confidence = Math.max(existing.confidence, r.confidence);
        await this.storage.updateRelationship(existing);
        await this.storage.deleteRelationship(r.relationship_id);
        actionsTaken.push(
          `Merged duplicate relationship '${r.relationship_id}' into '${existing.relationship_id}'`
        );
        repairedCount++;
      } else {
        edgeMap.set(edgeKey, r);
      }
    }

    if (repairedCount > 0) {
      await this.storage.save();
    }

    return {
      repaired: repairedCount > 0,
      issues_repaired: repairedCount,
      actions_taken: actionsTaken,
    };
  }
}
