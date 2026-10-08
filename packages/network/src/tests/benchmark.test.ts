import test from "node:test";
import assert from "node:assert";
import { performance } from "node:perf_hooks";
import { IdentityManager } from "../identity/identity-manager.js";
import { MessageAuthenticator } from "../protocol/authenticator.js";
import { NetworkNode } from "../service/network-node.js";

test("Network Performance Benchmark: Cryptographic operations and round-trip invocation", async () => {
  const alice = IdentityManager.generateKeyPair({ isDevelopment: true });
  const bob = IdentityManager.generateKeyPair({ isDevelopment: true });
  const authenticator = new MessageAuthenticator();

  // 1. Benchmark Message Signing Throughput
  const signIterations = 1000;
  const tSignStart = performance.now();
  for (let i = 0; i < signIterations; i++) {
    authenticator.createMessage({
      senderKeyPair: alice,
      recipientAgentId: bob.identity.agent_id,
      messageType: "PING",
      payload: { iteration: i },
    });
  }
  const tSignDuration = performance.now() - tSignStart;
  const signOpsPerSec = Math.round(signIterations / (tSignDuration / 1000));
  const avgSignLatencyUs = Math.round((tSignDuration / signIterations) * 1000);

  // 2. Benchmark Message Verification Throughput
  const testMsg = authenticator.createMessage({
    senderKeyPair: alice,
    recipientAgentId: bob.identity.agent_id,
    messageType: "PING",
    payload: { benchmark: true },
  });

  const verifyIterations = 1000;
  const tVerifyStart = performance.now();
  for (let i = 0; i < verifyIterations; i++) {
    // Reset nonce to allow benchmark loop
    testMsg.nonce = `bench_nonce_${i}`;
    testMsg.signature = IdentityManager.sign(
      MessageAuthenticator.computeSigningPayload(testMsg),
      alice.private_key
    );
    const res = authenticator.verifyMessage(testMsg, alice.identity.public_key);
    assert.strictEqual(res.valid, true);
  }
  const tVerifyDuration = performance.now() - tVerifyStart;
  const verifyOpsPerSec = Math.round(verifyIterations / (tVerifyDuration / 1000));
  const avgVerifyLatencyUs = Math.round((tVerifyDuration / verifyIterations) * 1000);

  // 3. Benchmark Capability Invocation Round-Trip
  const nodeA = new NetworkNode({
    keyPair: alice,
    limits: {
      max_requests_per_peer_per_minute: 5000,
      max_requests_per_capability_per_minute: 5000,
    },
  });
  const nodeB = new NetworkNode({
    keyPair: bob,
    limits: {
      max_requests_per_peer_per_minute: 5000,
      max_requests_per_capability_per_minute: 5000,
    },
  });
  await nodeA.start();
  await nodeB.start();

  nodeB.registerCapability(
    {
      capability_id: "bench.echo@1.0",
      name: "bench.echo",
      version: "1.0.0",
      description: "Echo for benchmark",
      input_schema: {},
      output_schema: {},
      required_permissions: ["REMOTE_READ"],
      risk_level: "LOW",
      provider_agent_id: bob.identity.agent_id,
      availability: "ONLINE",
    },
    async (input) => ({ output: { echo: input } })
  );

  nodeA.getPeerManager().registerPeer({
    agent_id: bob.identity.agent_id,
    public_key: bob.identity.public_key,
    capabilities: nodeB.getCapabilityRegistry().list(),
  });
  nodeB.getPeerManager().registerPeer({
    agent_id: alice.identity.agent_id,
    public_key: alice.identity.public_key,
  });

  const rttIterations = 200;
  const tRttStart = performance.now();
  for (let i = 0; i < rttIterations; i++) {
    const res = await nodeA.invokeRemoteCapability({
      targetAgentId: bob.identity.agent_id,
      capabilityId: "bench.echo@1.0",
      input: { count: i },
    });
    assert.strictEqual(res.status, "COMPLETED");
  }
  const tRttDuration = performance.now() - tRttStart;
  const rttOpsPerSec = Math.round(rttIterations / (tRttDuration / 1000));
  const avgRttLatencyMs = (tRttDuration / rttIterations).toFixed(2);

  await nodeA.stop();
  await nodeB.stop();

  console.log(`\n=== Network Performance Benchmark Results ===`);
  console.log(
    `Ed25519 Message Signing:      ${signOpsPerSec.toLocaleString()} ops/sec (${avgSignLatencyUs} µs/op)`
  );
  console.log(
    `Ed25519 Message Verification: ${verifyOpsPerSec.toLocaleString()} ops/sec (${avgVerifyLatencyUs} µs/op)`
  );
  console.log(
    `Capability Invocation RTT:    ${rttOpsPerSec.toLocaleString()} reqs/sec (${avgRttLatencyMs} ms/req)`
  );

  assert.ok(signOpsPerSec > 500);
  assert.ok(verifyOpsPerSec > 200);
});
