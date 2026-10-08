import { RAGContext, RAGPassage, Entity, Relationship, Evidence } from "../types/index.js";

export class ContextAssembler {
  assemble(params: {
    query: string;
    passages: RAGPassage[];
    entities: Entity[];
    relationships: Relationship[];
    evidence: Evidence[];
    vectorMaxScore?: number;
    sparseMaxScore?: number;
  }): RAGContext {
    const { query, passages, entities, relationships, evidence } = params;

    // Deduplicate and aggregate sources
    const sourceMap = new Map<
      string,
      { document_id: string; chunk_id: string; reference?: string }
    >();

    for (const p of passages) {
      const key = `${p.document_id}:${p.chunk_id}`;
      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          document_id: p.document_id,
          chunk_id: p.chunk_id,
          reference: p.source_ref,
        });
      }
    }

    for (const ev of evidence) {
      const key = `${ev.document_id}:${ev.chunk_id}`;
      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          document_id: ev.document_id,
          chunk_id: ev.chunk_id,
          reference: ev.source_text_reference,
        });
      }
    }

    const uniqueEntities = Array.from(new Map(entities.map((e) => [e.entity_id, e])).values());
    const uniqueRels = Array.from(
      new Map(relationships.map((r) => [r.relationship_id, r])).values()
    );
    const uniqueEvidence = Array.from(new Map(evidence.map((ev) => [ev.evidence_id, ev])).values());

    const graphCoverage = entities.length > 0 ? (relationships.length > 0 ? 1.0 : 0.5) : 0.0;

    return {
      query,
      passages,
      entities: uniqueEntities,
      relationships: uniqueRels,
      evidence: uniqueEvidence,
      sources: Array.from(sourceMap.values()),
      scores: {
        vector_max: params.vectorMaxScore ?? 0.0,
        sparse_max: params.sparseMaxScore ?? 0.0,
        graph_coverage: graphCoverage,
      },
    };
  }

  formatContextAsText(context: RAGContext): string {
    const lines: string[] = [];

    lines.push(`Query: ${context.query}`);
    lines.push("\n=== Verified Evidence Passages ===");
    for (const p of context.passages) {
      lines.push(
        `[Doc: ${p.document_id} / Chunk: ${p.chunk_id}] (Score: ${p.score.toFixed(3)}):\n${p.text}`
      );
    }

    if (context.relationships.length > 0) {
      lines.push("\n=== Knowledge Graph Relationships ===");
      for (const r of context.relationships) {
        lines.push(
          `- ${r.subject_entity_id} --[${r.predicate}]--> ${r.object_entity_id} (Confidence: ${r.confidence.toFixed(2)})`
        );
      }
    }

    if (context.evidence.length > 0) {
      lines.push("\n=== Supporting Source Assertions ===");
      for (const ev of context.evidence) {
        lines.push(
          `- "${ev.source_text_reference}" (Method: ${ev.extraction_method}, Confidence: ${ev.confidence.toFixed(2)})`
        );
      }
    }

    return lines.join("\n");
  }
}
