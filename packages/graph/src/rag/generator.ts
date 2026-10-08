import { RAGContext, GroundedAnswer, GroundedClaim } from "../types/index.js";

export interface IAnswerGenerator {
  generate(context: RAGContext): Promise<GroundedAnswer>;
}

export class LocalDeterministicAnswerGenerator implements IAnswerGenerator {
  async generate(context: RAGContext): Promise<GroundedAnswer> {
    if (context.passages.length === 0 && context.relationships.length === 0) {
      return {
        text: "Insufficient verified evidence found in local Knowledge Graph or documents to answer this query.",
        confidence: 0.0,
        supported_claims: [],
        unsupported_claims: [context.query],
        status: "UNSUPPORTED",
      };
    }

    const claims: GroundedClaim[] = [];
    const answerBullets: string[] = [];

    // Synthesize claims from relationships
    for (const r of context.relationships) {
      const subj =
        context.entities.find((e) => e.entity_id === r.subject_entity_id)?.canonical_name ||
        r.subject_entity_id;
      const obj =
        context.entities.find((e) => e.entity_id === r.object_entity_id)?.canonical_name ||
        r.object_entity_id;
      const claimText = `${subj} ${r.predicate.toLowerCase().replace(/_/g, " ")} ${obj}`;

      const citations: string[] = [];
      for (const evId of r.evidence_ids) {
        const ev = context.evidence.find((e) => e.evidence_id === evId);
        if (ev) {
          citations.push(`${ev.document_id}#${ev.chunk_id}`);
        }
      }

      claims.push({
        claim: claimText,
        evidence_ids: r.evidence_ids,
        citations,
      });

      answerBullets.push(`- ${claimText} [${citations.join(", ") || "KG-Edge"}]`);
    }

    // Synthesize top passage snippets if relationships are sparse
    if (claims.length === 0 && context.passages.length > 0) {
      const topP = context.passages[0];
      const claimText = topP.text.slice(0, 150).replace(/\n/g, " ");
      claims.push({
        claim: claimText,
        evidence_ids: [],
        citations: [`${topP.document_id}#${topP.chunk_id}`],
      });
      answerBullets.push(`- ${claimText} [${topP.document_id}#${topP.chunk_id}]`);
    }

    // Calculate genuine aggregate confidence
    let confidence = 0.5;
    if (context.evidence.length > 0) {
      const avgEv =
        context.evidence.reduce((a, b) => a + b.confidence, 0) / context.evidence.length;
      confidence = Number(avgEv.toFixed(2));
    } else if (context.passages.length > 0) {
      confidence = Number(Math.min(0.9, context.passages[0].score).toFixed(2));
    }

    const answerText = `Based on verified local source evidence:\n${answerBullets.join("\n")}`;

    return {
      text: answerText,
      confidence,
      supported_claims: claims,
      unsupported_claims: [],
      status: claims.length > 0 ? "SUPPORTED" : "PARTIALLY_SUPPORTED",
    };
  }
}
