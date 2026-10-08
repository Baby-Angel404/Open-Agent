import { SearchResultItem } from "../types/index.js";

export interface ScoreNormalizer {
  normalize(
    items: SearchResultItem[],
    scoreField: "dense_score" | "sparse_score"
  ): Map<string, number>;
}

export class MinMaxScoreNormalizer implements ScoreNormalizer {
  normalize(
    items: SearchResultItem[],
    scoreField: "dense_score" | "sparse_score"
  ): Map<string, number> {
    const normalized = new Map<string, number>();
    if (items.length === 0) return normalized;

    let min = Infinity;
    let max = -Infinity;

    for (const item of items) {
      const s = item[scoreField] ?? item.score;
      if (s < min) min = s;
      if (s > max) max = s;
    }

    if (min === max) {
      for (const item of items) {
        normalized.set(item.id, 1.0);
      }
      return normalized;
    }

    const range = max - min;
    for (const item of items) {
      const s = item[scoreField] ?? item.score;
      normalized.set(item.id, (s - min) / range);
    }

    return normalized;
  }
}

export interface HybridRankerOptions {
  denseWeight?: number;
  sparseWeight?: number;
  normalizer?: ScoreNormalizer;
}

export class HybridRanker {
  private defaultDenseWeight: number;
  private defaultSparseWeight: number;
  private normalizer: ScoreNormalizer;

  constructor(options: HybridRankerOptions = {}) {
    this.defaultDenseWeight = options.denseWeight ?? 0.7;
    this.defaultSparseWeight = options.sparseWeight ?? 0.3;
    this.normalizer = options.normalizer ?? new MinMaxScoreNormalizer();
  }

  /**
   * Merges dense and sparse candidates into a unified ranked list.
   * Uses min-max score normalization followed by weighted convex combination.
   */
  rank(
    denseResults: SearchResultItem[],
    sparseResults: SearchResultItem[],
    topK = 10,
    denseWeight = this.defaultDenseWeight,
    sparseWeight = this.defaultSparseWeight
  ): SearchResultItem[] {
    // 1. Normalize individual score distributions
    const normDense = this.normalizer.normalize(denseResults, "dense_score");
    const normSparse = this.normalizer.normalize(sparseResults, "sparse_score");

    // 2. Normalize weights to sum to 1.0
    const totalWeight = denseWeight + sparseWeight;
    const wDense = totalWeight > 0 ? denseWeight / totalWeight : 0.5;
    const wSparse = totalWeight > 0 ? sparseWeight / totalWeight : 0.5;

    // 3. Union candidate IDs and preserve item metadata
    const candidateMap = new Map<string, SearchResultItem>();

    for (const item of denseResults) {
      candidateMap.set(item.id, { ...item });
    }

    for (const item of sparseResults) {
      const existing = candidateMap.get(item.id);
      if (existing) {
        existing.sparse_score = item.sparse_score ?? item.score;
        if (!existing.text && item.text) existing.text = item.text;
      } else {
        candidateMap.set(item.id, { ...item });
      }
    }

    // 4. Compute weighted hybrid scores
    const mergedList: SearchResultItem[] = [];

    for (const [id, item] of candidateMap.entries()) {
      const sDense = normDense.get(id) || 0;
      const sSparse = normSparse.get(id) || 0;

      const hybridScore = Number((wDense * sDense + wSparse * sSparse).toFixed(6));

      mergedList.push({
        id: item.id,
        score: hybridScore,
        dense_score: item.dense_score,
        sparse_score: item.sparse_score,
        text: item.text,
        content_ref: item.content_ref,
        metadata: item.metadata,
      });
    }

    // 5. Sort descending by hybrid score
    mergedList.sort((a, b) => b.score - a.score);
    return mergedList.slice(0, Math.max(1, topK));
  }
}
