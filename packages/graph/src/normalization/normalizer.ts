export interface NormalizationOptions {
  lowercase?: boolean;
  trimWhitespace?: boolean;
  stripPunctuation?: boolean;
  unicodeNormalize?: boolean;
}

export class EntityNormalizer {
  private options: Required<NormalizationOptions>;

  constructor(options: NormalizationOptions = {}) {
    this.options = {
      lowercase: options.lowercase ?? true,
      trimWhitespace: options.trimWhitespace ?? true,
      stripPunctuation: options.stripPunctuation ?? true,
      unicodeNormalize: options.unicodeNormalize ?? true,
    };
  }

  normalize(rawText: string): string {
    if (!rawText) return "";

    let text = rawText;

    if (this.options.unicodeNormalize) {
      // Normalize Unicode (NFD decomposes composite characters)
      text = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    }

    if (this.options.trimWhitespace) {
      text = text.replace(/\s+/g, " ").trim();
    }

    if (this.options.stripPunctuation) {
      // Retain alphanumeric and spaces, strip outer/excess punctuation
      text = text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    }

    if (this.options.lowercase) {
      text = text.toLowerCase();
    }

    return text;
  }

  createCanonicalId(name: string, entityType: string): string {
    const norm = this.normalize(name)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const typeSlug = entityType.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    return `ent_${typeSlug}_${norm || "unnamed"}`;
  }

  isEquivalent(a: string, b: string): boolean {
    return this.normalize(a) === this.normalize(b);
  }

  /**
   * Levenshtein similarity metric bounded [0.0, 1.0]
   */
  stringSimilarity(s1: string, s2: string): number {
    const a = this.normalize(s1);
    const b = this.normalize(s2);
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    return Math.max(0, 1.0 - distance / maxLen);
  }
}
