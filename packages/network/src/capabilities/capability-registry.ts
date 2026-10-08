import { Capability, RiskLevel } from "../types/index.js";

export class InvalidCapabilityError extends Error {
  constructor(message: string) {
    super(`[InvalidCapability] ${message}`);
    this.name = "InvalidCapabilityError";
  }
}

export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();

  /**
   * Registers a capability with strict schema validation.
   * Arbitrary remote code execution is strictly rejected.
   */
  register(cap: Capability): void {
    if (!cap.capability_id || !cap.name || !cap.version) {
      throw new InvalidCapabilityError("Capability must specify capability_id, name, and version");
    }

    // Ban generic arbitrary remote code execution using word boundary matching
    const bannedRegex =
      /\b(eval|shell_exec|arbitrary_code|system_exec|remote_shell|command_execution)\b/i;

    if (bannedRegex.test(cap.name) || bannedRegex.test(cap.description)) {
      throw new InvalidCapabilityError(
        `Security violation: Arbitrary remote code execution capability '${cap.name}' is prohibited`
      );
    }

    if (!cap.input_schema || typeof cap.input_schema !== "object") {
      throw new InvalidCapabilityError("Capability must define a structured input_schema object");
    }

    if (!cap.output_schema || typeof cap.output_schema !== "object") {
      throw new InvalidCapabilityError("Capability must define a structured output_schema object");
    }

    this.capabilities.set(cap.capability_id, { ...cap });
  }

  unregister(capabilityId: string): boolean {
    return this.capabilities.delete(capabilityId);
  }

  get(capabilityId: string): Capability | undefined {
    const c = this.capabilities.get(capabilityId);
    return c ? { ...c } : undefined;
  }

  list(): Capability[] {
    return Array.from(this.capabilities.values()).map((c) => ({ ...c }));
  }

  /**
   * Finds a capability matching ID or name, with compatible version.
   * Supports exact ID (e.g. document.search@1.0) or name + SemVer.
   */
  findCompatible(idOrName: string, requestedVersion?: string): Capability | undefined {
    const direct = this.capabilities.get(idOrName);
    if (direct) return { ...direct };

    const cleanName = idOrName.includes("@") ? idOrName.split("@")[0] : idOrName;
    const versionFromId = idOrName.includes("@") ? idOrName.split("@")[1] : requestedVersion;

    for (const cap of this.capabilities.values()) {
      if (
        cap.capability_id.toLowerCase() === idOrName.toLowerCase() ||
        cap.name.toLowerCase() === cleanName.toLowerCase()
      ) {
        if (!versionFromId) return { ...cap };
        if (cap.version === versionFromId || cap.capability_id.endsWith(`@${versionFromId}`)) {
          return { ...cap };
        }

        const capMajor = cap.version.split(".")[0];
        const reqMajor = versionFromId.split(".")[0];
        if (capMajor === reqMajor) {
          return { ...cap };
        }
      }
    }
    return undefined;
  }

  /**
   * Deterministic search over capability registry.
   */
  search(query: string, filter?: { riskLevel?: RiskLevel; provider?: string }): Capability[] {
    const q = query.toLowerCase();
    return Array.from(this.capabilities.values())
      .filter((c) => {
        if (filter?.riskLevel && c.risk_level !== filter.riskLevel) return false;
        if (filter?.provider && c.provider_agent_id !== filter.provider) return false;

        return (
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.capability_id.toLowerCase().includes(q)
        );
      })
      .map((c) => ({ ...c }));
  }

  /**
   * Registers default safe standard capabilities provided by OpenAgent Infrastructure.
   */
  registerDefaults(providerAgentId: string): void {
    const defaults: Capability[] = [
      {
        capability_id: `document.search@1.0`,
        name: "document.search",
        version: "1.0.0",
        description: "Vector and keyword hybrid retrieval over indexed document collections",
        input_schema: {
          query: { type: "string" },
          collection: { type: "string" },
          top_k: { type: "number" },
        },
        output_schema: {
          results: { type: "array" },
        },
        required_permissions: ["REMOTE_READ"],
        risk_level: "LOW",
        provider_agent_id: providerAgentId,
        availability: "ONLINE",
      },
      {
        capability_id: `document.retrieve@1.0`,
        name: "document.retrieve",
        version: "1.0.0",
        description: "Fetches specific chunks with evidence provenance",
        input_schema: {
          chunk_id: { type: "string" },
        },
        output_schema: {
          chunk: { type: "object" },
        },
        required_permissions: ["REMOTE_READ"],
        risk_level: "LOW",
        provider_agent_id: providerAgentId,
        availability: "ONLINE",
      },
      {
        capability_id: `graph.query@1.0`,
        name: "graph.query",
        version: "1.0.0",
        description: "Knowledge graph entity neighborhood and traversal lookup",
        input_schema: {
          entity_id: { type: "string" },
          depth: { type: "number" },
        },
        output_schema: {
          neighbors: { type: "array" },
          relationships: { type: "array" },
        },
        required_permissions: ["REMOTE_READ"],
        risk_level: "LOW",
        provider_agent_id: providerAgentId,
        availability: "ONLINE",
      },
      {
        capability_id: `summarization@1.0`,
        name: "summarization",
        version: "1.0.0",
        description: "Deterministic summarization of text content",
        input_schema: {
          text: { type: "string" },
          max_length: { type: "number" },
        },
        output_schema: {
          summary: { type: "string" },
        },
        required_permissions: ["REMOTE_READ"],
        risk_level: "LOW",
        provider_agent_id: providerAgentId,
        availability: "ONLINE",
      },
      {
        capability_id: `embedding.generate@1.0`,
        name: "embedding.generate",
        version: "1.0.0",
        description: "Deterministic dense vector embedding calculation",
        input_schema: {
          text: { type: "string" },
        },
        output_schema: {
          embedding: { type: "array" },
        },
        required_permissions: ["REMOTE_READ"],
        risk_level: "LOW",
        provider_agent_id: providerAgentId,
        availability: "ONLINE",
      },
    ];

    for (const cap of defaults) {
      this.register(cap);
    }
  }
}
