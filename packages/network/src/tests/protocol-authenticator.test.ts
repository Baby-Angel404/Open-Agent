import test from "node:test";
import assert from "node:assert";
import { IdentityManager } from "../identity/identity-manager.js";
import { MessageAuthenticator } from "../protocol/authenticator.js";

test("MessageAuthenticator creates and verifies authentic messages", () => {
  const alice = IdentityManager.generateKeyPair();
  const bob = IdentityManager.generateKeyPair();
  const authenticator = new MessageAuthenticator();

  const msg = authenticator.createMessage({
    senderKeyPair: alice,
    recipientAgentId: bob.identity.agent_id,
    messageType: "PING",
    payload: { status: "ready" },
  });

  const verification = authenticator.verifyMessage(msg, alice.identity.public_key);
  assert.strictEqual(verification.valid, true);
});

test("MessageAuthenticator rejects replay attacks on duplicate nonce", () => {
  const alice = IdentityManager.generateKeyPair();
  const bob = IdentityManager.generateKeyPair();
  const authenticator = new MessageAuthenticator();

  const msg = authenticator.createMessage({
    senderKeyPair: alice,
    recipientAgentId: bob.identity.agent_id,
    messageType: "PING",
    payload: { test: 123 },
  });

  // First verification succeeds
  const first = authenticator.verifyMessage(msg, alice.identity.public_key);
  assert.strictEqual(first.valid, true);

  // Second verification with identical nonce is rejected as replay attack
  const replay = authenticator.verifyMessage(msg, alice.identity.public_key);
  assert.strictEqual(replay.valid, false);
  assert.ok(replay.error?.includes("Replay attack detected"));
});

test("MessageAuthenticator rejects expired messages and tampered payloads", () => {
  const alice = IdentityManager.generateKeyPair();
  const bob = IdentityManager.generateKeyPair();
  const authenticator = new MessageAuthenticator({ clock_skew_tolerance_ms: 1000 });

  const msg = authenticator.createMessage({
    senderKeyPair: alice,
    recipientAgentId: bob.identity.agent_id,
    messageType: "PING",
    payload: { value: 42 },
  });

  // Tampered payload
  const tampered = { ...msg, payload: { value: 999 } };
  const tamperedResult = authenticator.verifyMessage(tampered, alice.identity.public_key);
  assert.strictEqual(tamperedResult.valid, false);

  // Expired message
  const expiredMsg = {
    ...msg,
    nonce: "different_nonce_12345",
    timestamp: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
  };
  const expiredResult = authenticator.verifyMessage(expiredMsg, alice.identity.public_key);
  assert.strictEqual(expiredResult.valid, false);
  assert.ok(expiredResult.error?.includes("expired"));
});
