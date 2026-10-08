import { Entity, EntityType } from "../types/index.js";
import {
  IEntityExtractor,
  IRelationshipExtractor,
  ExtractedEntityMention,
  ExtractedRelationship,
} from "./base.js";

export interface OpenAIExtractorOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export class OpenAIEntityExtractor implements IEntityExtractor {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(options: OpenAIExtractorOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || "local-key";
    this.baseUrl = options.baseUrl || process.env.OPENAI_BASE_URL || "http://127.0.0.1:11434/v1";
    this.model = options.model || "llama3";
  }

  async extract(
    text: string,
    _context?: { document_id: string; chunk_id: string }
  ): Promise<ExtractedEntityMention[]> {
    try {
      const prompt = `Extract named entities from the text. Return a JSON array of objects with keys: "name", "type" (one of PERSON, ORGANIZATION, LOCATION, PRODUCT, CONCEPT, TECHNOLOGY, EVENT), "confidence" (0.0 to 1.0).
Text: """${text}"""
JSON:`;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as any;
      const content = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed) ? parsed : parsed.entities || [];

      const results: ExtractedEntityMention[] = [];
      for (const item of list) {
        if (!item.name || !item.type) continue;
        const idx = text.indexOf(item.name);
        results.push({
          name: String(item.name).trim(),
          entity_type: String(item.type).toUpperCase() as EntityType,
          start_offset: idx >= 0 ? idx : 0,
          end_offset: idx >= 0 ? idx + item.name.length : item.name.length,
          confidence: typeof item.confidence === "number" ? item.confidence : 0.85,
        });
      }
      return results;
    } catch {
      return [];
    }
  }
}

export class OpenAIRelationshipExtractor implements IRelationshipExtractor {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(options: OpenAIExtractorOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || "local-key";
    this.baseUrl = options.baseUrl || process.env.OPENAI_BASE_URL || "http://127.0.0.1:11434/v1";
    this.model = options.model || "llama3";
  }

  async extract(
    text: string,
    entities: Entity[],
    _context: { document_id: string; chunk_id: string }
  ): Promise<ExtractedRelationship[]> {
    if (entities.length < 2) return [];

    try {
      const entityNames = entities.map((e) => e.canonical_name).join(", ");
      const prompt = `Given the entities [${entityNames}], identify explicit factual relationships in the following text.
Return a JSON array of objects with keys: "subject", "predicate" (e.g. USED_FOR, DEPENDS_ON, CREATED_BY, PART_OF), "object", "confidence" (0.0 to 1.0), "evidence" (the exact sentence).
Text: """${text}"""
JSON:`;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as any;
      const content = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed) ? parsed : parsed.relationships || [];

      const results: ExtractedRelationship[] = [];
      for (const item of list) {
        if (!item.subject || !item.predicate || !item.object) continue;
        results.push({
          subject_name: String(item.subject).trim(),
          predicate: String(item.predicate)
            .toUpperCase()
            .replace(/[^A-Z0-9_]/g, "_"),
          object_name: String(item.object).trim(),
          confidence: typeof item.confidence === "number" ? item.confidence : 0.85,
          evidence_text: String(item.evidence || text).trim(),
        });
      }
      return results;
    } catch {
      return [];
    }
  }
}
