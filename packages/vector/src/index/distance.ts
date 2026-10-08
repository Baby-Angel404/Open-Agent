export class DimensionMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`Vector dimension mismatch: expected ${expected}, got ${actual}`);
    this.name = "DimensionMismatchError";
  }
}

export function validateVectorDimension(vector: number[], expectedDim: number): void {
  if (!Array.isArray(vector)) {
    throw new Error("Vector must be an array of numbers");
  }
  if (vector.length !== expectedDim) {
    throw new DimensionMismatchError(expectedDim, vector.length);
  }
  for (let i = 0; i < vector.length; i++) {
    if (typeof vector[i] !== "number" || Number.isNaN(vector[i]) || !Number.isFinite(vector[i])) {
      throw new Error(`Vector contains invalid element at index ${i}: ${vector[i]}`);
    }
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new DimensionMismatchError(a.length, b.length);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  // Bound to [-1, 1] against floating point inaccuracies
  return Math.max(-1, Math.min(1, score));
}

export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new DimensionMismatchError(a.length, b.length);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new DimensionMismatchError(a.length, b.length);
  }
  let sumSq = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

export function euclideanSimilarity(a: number[], b: number[]): number {
  const dist = euclideanDistance(a, b);
  return 1 / (1 + dist);
}
