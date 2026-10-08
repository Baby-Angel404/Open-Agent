import { RAGPassage, Entity, Relationship, Evidence } from "../types/index.js";

export interface GraphRankerWeights {
  vectorWeight?: number; // default: 0.35
  sparseWeight?: number; // default: 0.15
  graphWeight?: number; // default: 0.50
}

export interface CandidateScoringInput {
  passage: RAGPassage;
  vectorScore: number;
  sparseScore: number;
  graphDistance: number; // 0 for directly mentioning query entity, 1 for 1-hop neighbor, 2 for 2-hop, 999 for unlinked
  matchedEntities: Entity[];
  matchedRelationships: Relationship[];
  supportingEvidence: Evidence[];
}

export class GraphRanker {
  private vectorWeight: number;
  private sparseWeight: number;
  private graphWeight: number;

  constructor(weights: GraphRankerWeights = {}) {
    this.vectorWeight = weights.vectorWeight ?? 0.35;
    this.sparseWeight = weights.sparseWeight ?? 0.15;
    this.graphWeight = weights.graphWeight ?? 0.5;

    const total = this.vectorWeight + this.sparseWeight + this.graphWeight;
    this.vectorWeight /= total;
    this.sparseWeight /= total;
    this.graphWeight /= total;
  }

  scoreCandidate(input: CandidateScoringInput): number {
    // 1. Normalized vector and sparse score (clamped [0, 1])
    const normVector = Math.min(1.0, Math.max(0.0, input.vectorScore));
    const normSparse = Math.min(1.0, Math.max(0.0, input.sparseScore));

    // 2. Graph Proximity Score
    // distance 0 -> 1.0, distance 1 -> 0.75, distance 2 -> 0.50, distance >= 3 -> 0.10, unlinked -> 0.0
    let graphProximityScore = 0.0;
    if (input.graphDistance === 0) {
      graphProximityScore = 1.0;
    } else if (input.graphDistance === 1) {
      graphProximityScore = 0.75;
    } else if (input.graphDistance === 2) {
      graphProximityScore = 0.5;
    } else if (input.graphDistance <= 4) {
      graphProximityScore = 0.2;
    }

    // 3. Evidence confidence boost
    let evidenceBoost = 0.0;
    if (input.supportingEvidence.length > 0) {
      const maxConf = Math.max(...input.supportingEvidence.map((e) => e.confidence));
      evidenceBoost = maxConf * 0.2; // max +0.2 boost
    }

    // 4. Combined Graph Component
    const graphComponent = Math.min(1.0, graphProximityScore + evidenceBoost);

    // 5. Final Weighted Combination
    const finalScore =
      this.vectorWeight * normVector +
      this.sparseWeight * normSparse +
      this.graphWeight * graphComponent;

    return Number(finalScore.toFixed(4));
  }

  rerank(candidates: CandidateScoringInput[]): CandidateScoringInput[] {
    return candidates
      .map((c) => ({
        ...c,
        passage: {
          ...c.passage,
          score: this.scoreCandidate(c),
        },
      }))
      .sort((a, b) => b.passage.score - a.passage.score);
  }
}
