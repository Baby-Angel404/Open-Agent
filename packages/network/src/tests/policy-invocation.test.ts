import test from "node:test";
import assert from "node:assert";
import { IdentityManager } from "../identity/identity-manager.js";
import { CapabilityRegistry } from "../capabilities/capability-registry.js";
import { PeerManager } from "../discovery/peer-manager.js";
import { LocalDirectTransport } from "../transport/transport.js";
import { CapabilityInvocationHandler } from "../invocation/invocation-handler.js";
import { Policy } from "@open-agent/core";

test("CapabilityInvocationHandler enforces local policy and blocks sensitive leaks", async () => {
  const alice = IdentityManager.generateKeyPair();
  const bob = IdentityManager.generateKeyPair();

  const aliceTransport = new LocalDirectTransport(alice.identity.agent_id);
  const bobTransport = new LocalDirectTransport(bob.identity.agent_id);

  const registry = new CapabilityRegistry();
  registry.registerDefaults(bob.identity.agent_id);

  const peerManager = new PeerManager();
  peerManager.registerPeer({
    agent_id: bob.identity.agent_id,
    public_key: bob.identity.public_key,
    capabilities: registry.list(),
  });

  const strictPolicy: Policy = {
    id: "strict_policy",
    name: "Strict Policy",
    version: "1.0",
    defaultDecision: "ALLOW",
    rules: [
      {
        id: "deny_bob",
        actionType: "CAPABILITY_INVOCATION",
        targetPattern: `${bob.identity.agent_id}:*`,
        decision: "DENY",
        description: "Deny invoking Bob",
      },
    ],
  };

  const handler = new CapabilityInvocationHandler({
    keyPair: alice,
    policy: strictPolicy,
    registry,
    peerManager,
    transport: aliceTransport,
  });

  // 1. Policy DENY should reject invocation
  await assert.rejects(
    () =>
      handler.invokeRemoteCapability({
        targetAgentId: bob.identity.agent_id,
        capabilityId: "document.search@1.0",
        input: { query: "test" },
      }),
    /Local policy denied capability invocation/
  );

  // 2. Secret exfiltration attempt is strictly blocked
  const lenientPolicy: Policy = {
    id: "lenient",
    name: "Lenient",
    version: "1.0",
    defaultDecision: "ALLOW",
    rules: [],
  };
  const lenientHandler = new CapabilityInvocationHandler({
    keyPair: alice,
    policy: lenientPolicy,
    registry,
    peerManager,
    transport: aliceTransport,
  });

  // Attempting to send private_key in payload is caught by data transfer safety
  await assert.rejects(
    () =>
      lenientHandler.invokeRemoteCapability({
        targetAgentId: bob.identity.agent_id,
        capabilityId: "document.search@1.0",
        input: { query: "test", private_key: "leak_secret" },
      }),
    /Security boundary violation/
  );
});
