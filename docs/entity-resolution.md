# Entity Resolution & Normalization

OpenAgent uses conservative entity resolution to prevent false entity mergers while normalizing surface variations.

## Normalization Pipeline

1. **Unicode NFKD Normalization**: Decomposes diacritics and ligatures.
2. **Case & Whitespace Folding**: Trims extra whitespace and converts to uniform lowercase.
3. **Punctuation Stripping**: Strips commas, quotes, periods, and corporate suffixes (`Inc.`, `LLC`, `Corp.`) when matching candidates.
4. **Deterministic Canonical ID**: `ent_<type>_<normalized_name>` (e.g. `ent_technology_rust`).

## Disambiguation & Resolution Rules

- **Type Segregation**: Two mentions with identical surface names but different types (e.g., `Apple` as `ORGANIZATION` vs `Apple` as `PRODUCT`) are NEVER merged.
- **Alias Preservation**: New variations (e.g. `JS` for `JavaScript`) are appended to the entity's `aliases` set rather than creating disconnected duplicate entities.
- **String Similarity Thresholds**: Levenshtein distance matching requires high similarity (> 0.88) and identical entity type to propose merge candidates.
- **Safety Fallback**: Ambiguous entities with low confidence remain separate nodes rather than risking false positives.

## Source Files

- Normalizer: [`packages/graph/src/normalization/normalizer.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/normalization/normalizer.ts)
- Resolver: [`packages/graph/src/resolution/resolver.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/resolution/resolver.ts)
- Resolution Tests: [`packages/graph/src/tests/entity-resolution.test.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/tests/entity-resolution.test.ts)
