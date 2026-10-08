import { MetadataFilter } from "../types/index.js";

export function matchesMetadataFilter(
  metadata: Record<string, unknown> | undefined,
  filter?: MetadataFilter
): boolean {
  if (!filter || Object.keys(filter).length === 0) {
    return true;
  }
  if (!metadata) {
    return false;
  }

  for (const [key, condition] of Object.entries(filter)) {
    const val = metadata[key];

    // Primitive equality or direct comparison
    if (condition === null || typeof condition !== "object" || Array.isArray(condition)) {
      if (val !== condition) {
        return false;
      }
      continue;
    }

    // Complex filter operators
    const condObj = condition as Record<string, unknown>;

    if ("eq" in condObj && val !== condObj.eq) {
      return false;
    }

    if ("ne" in condObj && val === condObj.ne) {
      return false;
    }

    if ("gt" in condObj) {
      if (typeof val !== "number" || typeof condObj.gt !== "number" || val <= condObj.gt) {
        return false;
      }
    }

    if ("gte" in condObj) {
      if (typeof val !== "number" || typeof condObj.gte !== "number" || val < condObj.gte) {
        return false;
      }
    }

    if ("lt" in condObj) {
      if (typeof val !== "number" || typeof condObj.lt !== "number" || val >= condObj.lt) {
        return false;
      }
    }

    if ("lte" in condObj) {
      if (typeof val !== "number" || typeof condObj.lte !== "number" || val > condObj.lte) {
        return false;
      }
    }

    if ("in" in condObj) {
      if (!Array.isArray(condObj.in) || !condObj.in.includes(val)) {
        return false;
      }
    }

    if ("nin" in condObj) {
      if (Array.isArray(condObj.nin) && condObj.nin.includes(val)) {
        return false;
      }
    }

    if ("contains" in condObj) {
      if (
        typeof val !== "string" ||
        typeof condObj.contains !== "string" ||
        !val.toLowerCase().includes(condObj.contains.toLowerCase())
      ) {
        return false;
      }
    }
  }

  return true;
}

export function validateMetadataFilter(filter: unknown): void {
  if (filter === undefined || filter === null) return;
  if (typeof filter !== "object" || Array.isArray(filter)) {
    throw new Error("Metadata filter must be a key-value object");
  }

  const validOps = new Set(["eq", "ne", "gt", "gte", "lt", "lte", "in", "nin", "contains"]);
  for (const [key, condition] of Object.entries(filter as Record<string, unknown>)) {
    if (typeof key !== "string" || key.trim() === "") {
      throw new Error("Filter field keys must be non-empty strings");
    }
    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
      for (const op of Object.keys(condition as Record<string, unknown>)) {
        if (!validOps.has(op)) {
          throw new Error(`Unsupported filter operator '$${op}' on field '${key}'`);
        }
      }
    }
  }
}
