import { IEmbeddingProvider } from "../types/index.js";

/**
 * High-speed, deterministic local embedding provider based on feature hashing (hashing trick).
 * Projects text n-grams and tokens into an L2-normalized dense embedding of configurable dimension.
 * Requires zero network calls, zero external libraries, and runs 100% locally.
 */
export class LocalHashEmbeddingProvider implements IEmbeddingProvider {
  readonly name = "local_hash_embedder";
  readonly dimension: number;

  constructor(dimension = 64) {
    this.dimension = dimension;
  }

  private hashToken(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      const vec = new Float64Array(this.dimension);
      const tokens = text
        .toLowerCase()
        .split(/[\s,.;:!?_/\-\(\)\[\]"']+/)
        .filter(Boolean);

      if (tokens.length === 0) {
        results.push(Array.from(vec));
        continue;
      }

      // Unigrams and bigrams
      for (let i = 0; i < tokens.length; i++) {
        const unigram = tokens[i];
        const h1 = this.hashToken(unigram) % this.dimension;
        const sign1 = this.hashToken(unigram + "_sign") % 2 === 0 ? 1 : -1;
        vec[h1] += sign1;

        if (i < tokens.length - 1) {
          const bigram = `${tokens[i]}_${tokens[i + 1]}`;
          const h2 = this.hashToken(bigram) % this.dimension;
          const sign2 = this.hashToken(bigram + "_sign") % 2 === 0 ? 1 : -1;
          vec[h2] += sign2 * 1.5;
        }
      }

      // L2 Normalization
      let norm = 0;
      for (let i = 0; i < this.dimension; i++) {
        norm += vec[i] * vec[i];
      }
      norm = Math.sqrt(norm);

      if (norm > 0) {
        for (let i = 0; i < this.dimension; i++) {
          vec[i] /= norm;
        }
      }

      results.push(Array.from(vec));
    }

    return results;
  }
}

export interface OpenAICompatibleConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  dimension?: number;
}

/**
 * Embedding provider for OpenAI-compatible REST endpoints (e.g. Ollama, vLLM, LM Studio, OpenAI).
 */
export class OpenAICompatibleEmbeddingProvider implements IEmbeddingProvider {
  readonly name: string;
  readonly dimension: number;
  private baseUrl: string;
  private apiKey?: string;
  private model: string;

  constructor(config: OpenAICompatibleConfig = {}) {
    this.baseUrl = config.baseUrl || "http://127.0.0.1:11434/v1";
    this.apiKey = config.apiKey;
    this.model = config.model || "nomic-embed-text";
    this.dimension = config.dimension || 768;
    this.name = `openai_compatible:${this.model}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Embedding API failed with status ${res.status}: ${errorText}`);
    }

    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }
}

export class CustomEmbeddingProvider implements IEmbeddingProvider {
  readonly name: string;
  readonly dimension: number;
  private embedFn: (texts: string[]) => Promise<number[][]>;

  constructor(name: string, dimension: number, embedFn: (texts: string[]) => Promise<number[][]>) {
    this.name = name;
    this.dimension = dimension;
    this.embedFn = embedFn;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return this.embedFn(texts);
  }
}
