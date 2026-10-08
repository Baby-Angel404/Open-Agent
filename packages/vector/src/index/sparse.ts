import { VectorRecord, SearchResultItem, MetadataFilter } from "../types/index.js";
import { matchesMetadataFilter } from "./filter.js";

const DEFAULT_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "if",
  "in",
  "into",
  "is",
  "it",
  "no",
  "not",
  "of",
  "on",
  "or",
  "such",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "will",
  "with",
]);

export function tokenize(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .split(/[\s_-]+/)
    .filter((t) => t.length > 1 && !DEFAULT_STOP_WORDS.has(t));
}

export interface ISparseIndex {
  add(record: VectorRecord): void;
  delete(id: string): boolean;
  clear(): void;
  size(): number;
  search(query: string, topK: number, filter?: MetadataFilter): SearchResultItem[];
}

export class BM25SparseIndex implements ISparseIndex {
  private k1: number;
  private b: number;
  private records: Map<string, VectorRecord> = new Map();
  // term -> (recordId -> term frequency)
  private invertedIndex: Map<string, Map<string, number>> = new Map();
  private docLengths: Map<string, number> = new Map();
  private totalDocLength = 0;

  constructor(k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
  }

  add(record: VectorRecord): void {
    if (this.records.has(record.id)) {
      this.delete(record.id);
    }

    const textToTokenize = `${record.text || ""} ${JSON.stringify(record.metadata || {})}`;
    const tokens = tokenize(textToTokenize);
    const docLen = tokens.length;

    this.records.set(record.id, record);
    this.docLengths.set(record.id, docLen);
    this.totalDocLength += docLen;

    // Count term frequencies within this document
    const tfMap = new Map<string, number>();
    for (const token of tokens) {
      tfMap.set(token, (tfMap.get(token) || 0) + 1);
    }

    for (const [term, tf] of tfMap.entries()) {
      let postings = this.invertedIndex.get(term);
      if (!postings) {
        postings = new Map();
        this.invertedIndex.set(term, postings);
      }
      postings.set(record.id, tf);
    }
  }

  delete(id: string): boolean {
    const existing = this.records.get(id);
    if (!existing) return false;

    const docLen = this.docLengths.get(id) || 0;
    this.totalDocLength = Math.max(0, this.totalDocLength - docLen);
    this.docLengths.delete(id);
    this.records.delete(id);

    // Remove from inverted index
    for (const [term, postings] of this.invertedIndex.entries()) {
      if (postings.has(id)) {
        postings.delete(id);
        if (postings.size === 0) {
          this.invertedIndex.delete(term);
        }
      }
    }
    return true;
  }

  clear(): void {
    this.records.clear();
    this.invertedIndex.clear();
    this.docLengths.clear();
    this.totalDocLength = 0;
  }

  size(): number {
    return this.records.size;
  }

  search(query: string, topK = 10, filter?: MetadataFilter): SearchResultItem[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.records.size === 0) {
      return [];
    }

    const N = this.records.size;
    const avgdl = this.totalDocLength / N || 1;

    // Accumulate BM25 score per matching candidate
    const docScores = new Map<string, number>();

    for (const term of queryTokens) {
      const postings = this.invertedIndex.get(term);
      if (!postings) continue;

      const df = postings.size;
      // Robertson-Spärck Jones IDF formula with add-1 smoothing
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

      for (const [docId, tf] of postings.entries()) {
        const docLen = this.docLengths.get(docId) || avgdl;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / avgdl));
        const termScore = idf * (numerator / denominator);

        docScores.set(docId, (docScores.get(docId) || 0) + termScore);
      }
    }

    const results: SearchResultItem[] = [];

    for (const [docId, score] of docScores.entries()) {
      const record = this.records.get(docId);
      if (!record) continue;

      if (!matchesMetadataFilter(record.metadata, filter)) {
        continue;
      }

      results.push({
        id: record.id,
        score,
        sparse_score: score,
        text: record.text,
        content_ref: record.content_ref,
        metadata: record.metadata,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, Math.max(1, topK));
  }
}
