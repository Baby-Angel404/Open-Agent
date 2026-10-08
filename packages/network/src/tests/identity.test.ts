import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { IdentityManager } from "../identity/identity-manager.js";

test("IdentityManager generates valid Ed25519 keypair and deterministic agent ID", () => {
  const keyPair = IdentityManager.generateKeyPair({ isDevelopment: true });

  assert.ok(keyPair.identity.agent_id.startsWith("agent_"));
  assert.strictEqual(keyPair.identity.key_algorithm, "Ed25519");
  assert.ok(keyPair.identity.public_key.length > 20);
  assert.ok(keyPair.private_key.length > 20);
  assert.strictEqual(keyPair.identity.metadata?.environment, "development");

  // Verify ID matches public key
  const matches = IdentityManager.verifyAgentIdMatchesPublicKey(
    keyPair.identity.agent_id,
    keyPair.identity.public_key
  );
  assert.strictEqual(matches, true);
});

test("IdentityManager signs and verifies data correctly", () => {
  const keyPair = IdentityManager.generateKeyPair();
  const message = "OpenAgent deterministic execution payload";

  const signature = IdentityManager.sign(message, keyPair.private_key);
  assert.ok(signature.length > 10);

  const isValid = IdentityManager.verify(message, signature, keyPair.identity.public_key);
  assert.strictEqual(isValid, true);

  // Tampered payload fails verification
  const isTamperedValid = IdentityManager.verify(
    "Tampered message content",
    signature,
    keyPair.identity.public_key
  );
  assert.strictEqual(isTamperedValid, false);

  // Wrong public key fails verification
  const otherKeyPair = IdentityManager.generateKeyPair();
  const isWrongKeyValid = IdentityManager.verify(
    message,
    signature,
    otherKeyPair.identity.public_key
  );
  assert.strictEqual(isWrongKeyValid, false);
});

test("IdentityManager saves and reloads identity with strict permissions", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openagent-identity-test-"));
  const keyPair = IdentityManager.loadOrCreateIdentity(tmpDir, true);

  assert.ok(fs.existsSync(path.join(tmpDir, "agent-identity.json")));

  // Reloading returns identical identity
  const reloaded = IdentityManager.loadOrCreateIdentity(tmpDir, true);
  assert.strictEqual(reloaded.identity.agent_id, keyPair.identity.agent_id);
  assert.strictEqual(reloaded.identity.public_key, keyPair.identity.public_key);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
