import test from "node:test";
import assert from "node:assert";
import { EntityNormalizer } from "../normalization/normalizer.js";
import { EntityResolver } from "../resolution/resolver.js";
import { Entity } from "../types/index.js";

test("EntityNormalizer handles Unicode, whitespace, punctuation, and case", () => {
  const norm = new EntityNormalizer();

  assert.strictEqual(norm.normalize("  Microsoft Corp.  "), "microsoft corp");
  assert.strictEqual(norm.normalize("Café München"), "cafe munchen");
  assert.strictEqual(norm.normalize("Node.js!"), "node.js");
  assert.strictEqual(norm.createCanonicalId("Rust", "TECHNOLOGY"), "ent_technology_rust");
});

test("EntityNormalizer computes string similarity correctly", () => {
  const norm = new EntityNormalizer();

  assert.strictEqual(norm.stringSimilarity("PostgreSQL", "PostgreSQL"), 1.0);
  assert.ok(norm.stringSimilarity("Postgres", "PostgreSQL") > 0.6);
  assert.strictEqual(norm.stringSimilarity("Docker", "Kubernetes") < 0.3, true);
});

test("EntityResolver resolves canonical names and preserves aliases without aggressive merging", () => {
  const resolver = new EntityResolver();
  const existing: Entity[] = [];

  // 1. Initial entity
  const res1 = resolver.resolve("Microsoft", "ORGANIZATION", existing);
  assert.strictEqual(res1.isNew, true);
  assert.strictEqual(res1.entity.canonical_name, "Microsoft");
  existing.push(res1.entity);

  // 2. Exact match resolves to existing entity
  const res2 = resolver.resolve("microsoft", "ORGANIZATION", existing);
  assert.strictEqual(res2.isNew, false);
  assert.strictEqual(res2.entity.entity_id, res1.entity.entity_id);

  // 3. Organization with company suffix resolves to existing entity
  const res3 = resolver.resolve("Microsoft Corporation", "ORGANIZATION", existing);
  assert.strictEqual(res3.isNew, false);
  assert.strictEqual(res3.entity.entity_id, res1.entity.entity_id);
  assert.ok(res3.entity.aliases.includes("Microsoft Corporation"));

  // 4. Same name with DIFFERENT entity type MUST NOT merge (prevents false identities)
  const res4 = resolver.resolve("Microsoft", "PRODUCT", existing);
  assert.strictEqual(res4.isNew, true);
  assert.notStrictEqual(res4.entity.entity_id, res1.entity.entity_id);

  // 5. Distinct entity creates separate record
  const res5 = resolver.resolve("Apple", "ORGANIZATION", existing);
  assert.strictEqual(res5.isNew, true);
  assert.strictEqual(res5.entity.canonical_name, "Apple");
});
