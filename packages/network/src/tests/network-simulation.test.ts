import test from "node:test";
import assert from "node:assert";
import { IdentityManager } from "../identity/identity-manager.js";
import { NetworkNode } from "../service/network-node.js";
import { MessageAuthenticator } from "../protocol/authenticator.js";

test("Integration Test Network: Multi-agent interaction between Agent A, Agent B, and Malicious Agent C", async () => {
  // 1. Setup Identities
  const agentAKey = IdentityManager.generateKeyPair({ isDevelopment: true });
  const agentBKey = IdentityManager.generateKeyPair({ isDevelopment: true });
  const agentCKey = IdentityManager.generateKeyPair({ isDevelopment: true });

  const nodeA = new NetworkNode({ keyPair: agentAKey });
  const nodeB = new NetworkNode({ keyPair: agentBKey });
  const nodeC = new NetworkNode({ keyPair: agentCKey });

  await nodeA.start();
  await nodeB.start();
  await nodeC.start();

  // Register custom capability on Agent B
  nodeB.registerCapability(
    {
      capability_id: "text.summarize@1.0",
      name: "text.summarize",
      version: "1.0.0",
      description: "Summarizes text",
      input_schema: { text: { type: "string" } },
      output_schema: { summary: { type: "string" } },
      required_permissions: ["REMOTE_READ"],
      risk_level: "LOW",
      provider_agent_id: agentBKey.identity.agent_id,
      availability: "ONLINE",
    },
    async (input) => {
      return { output: { summary: `Summary of: ${input.text}` } };
    }
  );

  // 2. A discovers and registers B
  nodeA.getPeerManager().registerPeer({
    agent_id: agentBKey.identity.agent_id,
    public_key: agentBKey.identity.public_key,
    capabilities: nodeB.getCapabilityRegistry().list(),
  });
  nodeB.getPeerManager().registerPeer({
    agent_id: agentAKey.identity.agent_id,
    public_key: agentAKey.identity.public_key,
  });

  // 3. A invokes B's capability successfully
  const response = await nodeA.invokeRemoteCapability({
    targetAgentId: agentBKey.identity.agent_id,
    capabilityId: "text.summarize@1.0",
    input: { text: "OpenAgent decentralized infrastructure" },
  });

  assert.strictEqual(response.status, "COMPLETED");
  assert.strictEqual(
    (response.output as any).summary,
    "Summary of: OpenAgent decentralized infrastructure"
  );

  // Agent A's reputation record for B should have increased (+2.0)
  const repB = nodeA.getReputationManager().getRecord(agentBKey.identity.agent_id);
  assert.strictEqual(repB.score, 52.0);
  assert.strictEqual(repB.successful_requests, 1);

  // 4. Malicious Agent C attempt: Forged signature
  const authenticator = new MessageAuthenticator();
  const forgedMessage = authenticator.createMessage({
    senderKeyPair: agentCKey,
    recipientAgentId: agentAKey.identity.agent_id,
    messageType: "PING",
    payload: { action: "unauthorized" },
  });
  forgedMessage.signature = "invalid_forged_base64_signature";

  const verifyForged = authenticator.verifyMessage(forgedMessage, agentCKey.identity.public_key);
  assert.strictEqual(verifyForged.valid, false);
  assert.strictEqual(verifyForged.error, "Cryptographic signature verification failed");

  // 5. Blocklist test: B blocks Agent C
  nodeB.getPeerManager().blockPeer(agentCKey.identity.agent_id, "Malicious activity");
  assert.strictEqual(nodeB.getPeerManager().isBlocked(agentCKey.identity.agent_id), true);

  const blockedResponse = await nodeB.getInvocationHandler().handleIncomingRequest({
    request_id: "req_c_1",
    caller_agent_id: agentCKey.identity.agent_id,
    target_agent_id: agentBKey.identity.agent_id,
    capability_id: "text.summarize@1.0",
    capability_version: "1.0",
    input: { text: "hack" },
    deadline: new Date(Date.now() + 5000).toISOString(),
    data_classification: "PUBLIC",
  });

  assert.strictEqual(blockedResponse.status, "REJECTED");
  assert.ok(blockedResponse.error?.includes("blocked"));

  await nodeA.stop();
  await nodeB.stop();
  await nodeC.stop();
});
