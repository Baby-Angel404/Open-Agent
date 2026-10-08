import { Entity, EntityType } from "../types/index.js";
import {
  IEntityExtractor,
  IRelationshipExtractor,
  ExtractedEntityMention,
  ExtractedRelationship,
} from "./base.js";
import { EntityNormalizer } from "../normalization/normalizer.js";

interface KnownEntityPattern {
  name: string;
  type: EntityType;
  regex: RegExp;
}

export class RuleBasedEntityExtractor implements IEntityExtractor {
  private knownPatterns: KnownEntityPattern[];

  constructor() {
    this.knownPatterns = [
      // Technologies
      { name: "Rust", type: "TECHNOLOGY", regex: /\b(Rust)\b/g },
      { name: "TypeScript", type: "TECHNOLOGY", regex: /\b(TypeScript|TS)\b/g },
      { name: "JavaScript", type: "TECHNOLOGY", regex: /\b(JavaScript|JS)\b/g },
      { name: "Python", type: "TECHNOLOGY", regex: /\b(Python)\b/g },
      { name: "Node.js", type: "TECHNOLOGY", regex: /\b(Node\.js|NodeJS|Node)\b/g },
      { name: "Linux", type: "TECHNOLOGY", regex: /\b(Linux)\b/g },
      { name: "Docker", type: "TECHNOLOGY", regex: /\b(Docker)\b/g },
      { name: "PostgreSQL", type: "TECHNOLOGY", regex: /\b(PostgreSQL|Postgres)\b/g },
      { name: "SQLite", type: "TECHNOLOGY", regex: /\b(SQLite)\b/g },
      { name: "Chromium", type: "TECHNOLOGY", regex: /\b(Chromium)\b/g },
      { name: "OpenAgent", type: "PRODUCT", regex: /\b(OpenAgent|OpenAgent Infrastructure)\b/g },

      // Concepts
      { name: "Knowledge Graph", type: "CONCEPT", regex: /\b(Knowledge Graph|KG)\b/gi },
      { name: "Vector Database", type: "CONCEPT", regex: /\b(Vector Database|Vector Engine)\b/gi },
      { name: "Graph RAG", type: "CONCEPT", regex: /\b(Graph RAG|Graph-RAG)\b/gi },
      { name: "Policy Engine", type: "CONCEPT", regex: /\b(Policy Engine)\b/gi },
      { name: "Audit Trail", type: "CONCEPT", regex: /\b(Audit Trail|Audit Log)\b/gi },
      { name: "Systems Programming", type: "CONCEPT", regex: /\b(Systems Programming)\b/gi },
      { name: "Browser Automation", type: "CONCEPT", regex: /\b(Browser Automation)\b/gi },
    ];
  }

  async extract(
    text: string,
    _context?: { document_id: string; chunk_id: string }
  ): Promise<ExtractedEntityMention[]> {
    const mentions: ExtractedEntityMention[] = [];
    const seenSpans = new Set<string>();

    // 1. Match cataloged patterns
    for (const pat of this.knownPatterns) {
      pat.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pat.regex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const spanKey = `${start}:${end}`;
        if (!seenSpans.has(spanKey)) {
          seenSpans.add(spanKey);
          mentions.push({
            name: pat.name,
            entity_type: pat.type,
            start_offset: start,
            end_offset: end,
            confidence: 0.95,
          });
        }
      }
    }

    // 2. Named entity pattern (capitalized phrases of 1-3 words)
    const capRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
    let capMatch: RegExpExecArray | null;
    while ((capMatch = capRegex.exec(text)) !== null) {
      const start = capMatch.index;
      const matchedStr = capMatch[1];
      const end = start + matchedStr.length;
      const spanKey = `${start}:${end}`;

      // Exclude common starting stop words
      if (
        /^(The|This|That|These|Those|When|Where|What|Why|How|If|Then|However|Every|Never|All|Each|And|Or|But)\b/.test(
          matchedStr
        )
      ) {
        continue;
      }

      if (!seenSpans.has(spanKey) && matchedStr.length > 2) {
        seenSpans.add(spanKey);
        mentions.push({
          name: matchedStr,
          entity_type: "CONCEPT",
          start_offset: start,
          end_offset: end,
          confidence: 0.75,
        });
      }
    }

    return mentions;
  }
}

interface RelRule {
  pattern: RegExp;
  predicate: string;
  confidence: number;
}

export class RuleBasedRelationshipExtractor implements IRelationshipExtractor {
  private normalizer = new EntityNormalizer();
  private rules: RelRule[];

  constructor() {
    this.rules = [
      {
        pattern: /(.+?)\s+(?:is used (?:for|to build))\s+(.+)/i,
        predicate: "USED_FOR",
        confidence: 0.92,
      },
      {
        pattern: /(.+?)\s+(?:depends on|relies on|requires)\s+(.+)/i,
        predicate: "DEPENDS_ON",
        confidence: 0.9,
      },
      {
        pattern: /(.+?)\s+(?:is developed by|created by|built by)\s+(.+)/i,
        predicate: "CREATED_BY",
        confidence: 0.94,
      },
      {
        pattern: /(.+?)\s+(?:is part of|belongs to|included in)\s+(.+)/i,
        predicate: "PART_OF",
        confidence: 0.88,
      },
      {
        pattern: /(.+?)\s+(?:is located in|based in)\s+(.+)/i,
        predicate: "LOCATED_IN",
        confidence: 0.89,
      },
      {
        pattern: /(.+?)\s+(?:implements|provides)\s+(.+)/i,
        predicate: "IMPLEMENTS",
        confidence: 0.85,
      },
      {
        pattern: /(.+?)\s+(?:is an alternative to|competes with)\s+(.+)/i,
        predicate: "ALTERNATIVE_TO",
        confidence: 0.87,
      },
    ];
  }

  async extract(
    text: string,
    entities: Entity[],
    _context: { document_id: string; chunk_id: string }
  ): Promise<ExtractedRelationship[]> {
    const results: ExtractedRelationship[] = [];
    if (entities.length < 2) return results;

    // Split text into sentences for scoped relational evidence
    const sentences = text.split(/(?<=[.?!;])\s+/);

    for (const sentence of sentences) {
      // Find entities present in this sentence
      const presentEntities = entities.filter(
        (e) =>
          sentence.toLowerCase().includes(e.canonical_name.toLowerCase()) ||
          e.aliases.some((a) => sentence.toLowerCase().includes(a.toLowerCase()))
      );

      if (presentEntities.length < 2) continue;

      for (const rule of this.rules) {
        const match = rule.pattern.exec(sentence);
        if (!match) continue;

        const leftText = match[1].trim();
        const rightText = match[2].trim();

        // Match leftText and rightText to present entities
        let subject: Entity | undefined;
        let object: Entity | undefined;

        for (const e of presentEntities) {
          const name = e.canonical_name.toLowerCase();
          if (leftText.toLowerCase().includes(name)) {
            subject = e;
          }
          if (rightText.toLowerCase().includes(name)) {
            object = e;
          }
        }

        if (subject && object && subject.entity_id !== object.entity_id) {
          results.push({
            subject_name: subject.canonical_name,
            predicate: rule.predicate,
            object_name: object.canonical_name,
            confidence: rule.confidence,
            evidence_text: sentence.trim(),
          });
        }
      }
    }

    return results;
  }
}
