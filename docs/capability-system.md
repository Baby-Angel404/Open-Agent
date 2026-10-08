# Capability System & Marketplace

The Capability System provides a declarative, schema-validated registry for agent capabilities while strictly preventing arbitrary remote code execution.

## Capability Definition Schema

```typescript
export interface Capability {
  capability_id: string; // Format: name@semver (e.g. document.search@1.0)
  name: string; // Dot-separated namespace (e.g. document.search)
  version: string; // SemVer 2.0 (e.g. 1.0.0)
  description: string; // Human-readable summary
  input_schema: Record<string, unknown>; // JSON Schema for invocation arguments
  output_schema: Record<string, unknown>; // JSON Schema for invocation output
  required_permissions: string[]; // e.g. ["REMOTE_READ"]
  risk_level: RiskLevel; // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  provider_agent_id: string; // Agent offering this capability
  availability: CapabilityAvailability; // "ONLINE" | "BUSY" | "OFFLINE"
}
```

## Security Invariants & Code Execution Ban

- **Arbitrary Code Execution Ban**: Any capability that advertises `eval`, `shell_exec`, `child_process`, `exec`, `system`, or raw arbitrary code execution is strictly rejected by the registry using word-boundary security filters.
- **Strict Input Validation**: Invocation parameters must validate against the capability's `input_schema` prior to execution.
- **Semantic Version Resolution**: Clients request capabilities with version constraints (e.g. `^1.0.0`); the registry resolves the highest compatible semver.

## Built-in Standard Capabilities

1. `document.search@1.0`: Dense + sparse hybrid vector search across local collections (`Risk: LOW`).
2. `document.retrieve@1.0`: Evidence passage retrieval with verified chunk IDs (`Risk: LOW`).
3. `graph.query@1.0`: Knowledge graph entity neighborhood and traversal lookup (`Risk: LOW`).
4. `summarization@1.0`: Deterministic summarization of retrieved content (`Risk: LOW`).
5. `embedding.generate@1.0`: Dense vector embedding calculation (`Risk: LOW`).

## Source Reference

- Registry Implementation: [`packages/network/src/capabilities/capability-registry.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/capabilities/capability-registry.ts)
- Types: [`packages/network/src/types/index.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/network/src/types/index.ts)
