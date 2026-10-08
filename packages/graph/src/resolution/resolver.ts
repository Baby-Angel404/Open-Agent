import { Entity, EntityType } from "../types/index.js";
import { EntityNormalizer } from "../normalization/normalizer.js";

export interface ResolutionOptions {
  similarityThreshold?: number; // Default: 0.90
  stripCompanySuffixes?: boolean;
}

export class EntityResolver {
  private normalizer: EntityNormalizer;
  private similarityThreshold: number;
  private stripCompanySuffixes: boolean;

  private static readonly COMPANY_SUFFIXES = [
    /\b(corp|corporation|inc|incorporated|llc|ltd|limited|gmbh|co|company)\b/gi,
  ];

  constructor(options: ResolutionOptions = {}) {
    this.normalizer = new EntityNormalizer();
    this.similarityThreshold = options.similarityThreshold ?? 0.9;
    this.stripCompanySuffixes = options.stripCompanySuffixes !== false;
  }

  private cleanCompanyName(name: string): string {
    let cleaned = name;
    for (const pattern of EntityResolver.COMPANY_SUFFIXES) {
      cleaned = cleaned.replace(pattern, " ");
    }
    return this.normalizer.normalize(cleaned);
  }

  resolve(
    candidateName: string,
    entityType: EntityType,
    existingEntities: Entity[],
    knownAliases: string[] = []
  ): { entity: Entity; isNew: boolean } {
    const normCandidate = this.normalizer.normalize(candidateName);

    // 1. Direct match on canonical name or existing aliases (Type must match)
    for (const ent of existingEntities) {
      if (ent.entity_type !== entityType) continue;

      if (this.normalizer.normalize(ent.canonical_name) === normCandidate) {
        this.appendAliases(ent, candidateName, knownAliases);
        return { entity: ent, isNew: false };
      }

      for (const alias of ent.aliases) {
        if (this.normalizer.normalize(alias) === normCandidate) {
          this.appendAliases(ent, candidateName, knownAliases);
          return { entity: ent, isNew: false };
        }
      }
    }

    // 2. Company suffix normalization check for ORGANIZATION / PRODUCT
    if (this.stripCompanySuffixes && (entityType === "ORGANIZATION" || entityType === "PRODUCT")) {
      const strippedCandidate = this.cleanCompanyName(candidateName);
      if (strippedCandidate.length >= 3) {
        for (const ent of existingEntities) {
          if (ent.entity_type !== entityType) continue;
          const strippedExisting = this.cleanCompanyName(ent.canonical_name);
          if (strippedExisting === strippedCandidate) {
            this.appendAliases(ent, candidateName, knownAliases);
            return { entity: ent, isNew: false };
          }
        }
      }
    }

    // 3. High-confidence string similarity check (Never merge across different types)
    for (const ent of existingEntities) {
      if (ent.entity_type !== entityType) continue;

      const sim = this.normalizer.stringSimilarity(ent.canonical_name, candidateName);
      if (sim >= this.similarityThreshold) {
        this.appendAliases(ent, candidateName, knownAliases);
        return { entity: ent, isNew: false };
      }
    }

    // 4. Insufficient confidence: Create new separate entity to prevent false mergers
    const now = new Date().toISOString();
    const allAliases = Array.from(new Set([candidateName, ...knownAliases].filter(Boolean)));
    const newEntity: Entity = {
      entity_id: this.normalizer.createCanonicalId(candidateName, entityType),
      canonical_name: candidateName.trim(),
      entity_type: entityType,
      aliases: allAliases,
      created_at: now,
      updated_at: now,
    };

    return { entity: newEntity, isNew: true };
  }

  private appendAliases(entity: Entity, newName: string, additional: string[]): void {
    const set = new Set(entity.aliases.map((a) => this.normalizer.normalize(a)));
    const toAdd = [newName, ...additional].filter(Boolean);

    let changed = false;
    for (const a of toAdd) {
      const norm = this.normalizer.normalize(a);
      if (!set.has(norm)) {
        entity.aliases.push(a.trim());
        set.add(norm);
        changed = true;
      }
    }

    if (changed) {
      entity.updated_at = new Date().toISOString();
    }
  }
}
