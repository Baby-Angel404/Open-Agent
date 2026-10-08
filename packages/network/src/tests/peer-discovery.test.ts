import test from "node:test";
import assert from "node:assert";
import { PeerManager } from "../discovery/peer-manager.js";
import { IdentityManager } from "../identity/identity-manager.js";

test("PeerManager enforces Discovery != Trust and defaults to UNKNOWN state", () => {
  const manager = new PeerManager();
  const bob = IdentityManager.generateKeyPair();

  const peer = manager.registerPeer({
    agent_id: bob.identity.agent_id,
    public_key: bob.identity.public_key,
    addresses: ["http://127.0.0.1:4001"],
  });

  assert.strictEqual(peer.trust_state, "UNKNOWN");
  assert.strictEqual(peer.agent_id, bob.identity.agent_id);
  assert.strictEqual(peer.reputation_score, 50.0);

  // Promoting to VERIFIED
  manager.updateTrustState(bob.identity.agent_id, "VERIFIED");
  assert.strictEqual(manager.getPeer(bob.identity.agent_id)?.trust_state, "VERIFIED");
});

test("PeerManager manages blocklist and prevents blocked peers from becoming trusted", () => {
  const manager = new PeerManager();
  const charlie = IdentityManager.generateKeyPair();

  manager.registerPeer({
    agent_id: charlie.identity.agent_id,
    public_key: charlie.identity.public_key,
  });

  // Block peer
  manager.blockPeer(charlie.identity.agent_id, "Suspicious behavior");
  assert.strictEqual(manager.isBlocked(charlie.identity.agent_id), true);
  assert.strictEqual(manager.getPeer(charlie.identity.agent_id)?.trust_state, "BLOCKED");

  // Attempting to change trust state while blocked throws error
  assert.throws(() => {
    manager.updateTrustState(charlie.identity.agent_id, "TRUSTED");
  });

  // Unblock resets to UNKNOWN (never automatically trusted)
  manager.unblockPeer(charlie.identity.agent_id);
  assert.strictEqual(manager.isBlocked(charlie.identity.agent_id), false);
  assert.strictEqual(manager.getPeer(charlie.identity.agent_id)?.trust_state, "UNKNOWN");
});
