import test from "node:test";
import assert from "node:assert";
import { CapabilityRegistry, InvalidCapabilityError } from "../capabilities/capability-registry.js";
import { Capability } from "../types/index.js";

test("CapabilityRegistry registers valid capability and finds compatible versions", () => {
  const registry = new CapabilityRegistry();

  const cap: Capability = {
    capability_id: "document.search@1.0",
    name: "document.search",
    version: "1.0.0",
    description: "Search document collections",
    input_schema: { query: { type: "string" } },
    output_schema: { results: { type: "array" } },
    required_permissions: ["REMOTE_READ"],
    risk_level: "LOW",
    provider_agent_id: "agent_provider",
    availability: "ONLINE",
  };

  registry.register(cap);
  assert.strictEqual(registry.list().length, 1);

  // Exact version match
  const exact = registry.findCompatible("document.search", "1.0.0");
  assert.ok(exact);

  // Prefix match
  const prefix = registry.findCompatible("document.search", "1.0");
  assert.ok(prefix);

  // Major mismatch returns undefined
  const incompatible = registry.findCompatible("document.search", "2.0.0");
  assert.strictEqual(incompatible, undefined);
});

test("CapabilityRegistry rejects arbitrary remote code execution capabilities", () => {
  const registry = new CapabilityRegistry();

  const malicious: Capability = {
    capability_id: "remote.eval@1.0",
    name: "remote.eval_code",
    version: "1.0.0",
    description: "Executes arbitrary shell_exec instructions",
    input_schema: {},
    output_schema: {},
    required_permissions: [],
    risk_level: "CRITICAL",
    provider_agent_id: "agent_bad",
    availability: "ONLINE",
  };

  assert.throws(
    () => registry.register(malicious),
    (err: any) =>
      err instanceof InvalidCapabilityError &&
      err.message.includes("Arbitrary remote code execution")
  );
});

test("CapabilityRegistry registers default standard capabilities", () => {
  const registry = new CapabilityRegistry();
  registry.registerDefaults("agent_local_node");

  const list = registry.list();
  assert.ok(list.length >= 5);

  const searchResults = registry.search("document");
  assert.ok(searchResults.length >= 2);
});
