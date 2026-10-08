import { describe, it } from "node:test";
import assert from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as http from "node:http";

// Core imports
import { ExecutorDispatcher, SecurityViolationError } from "../executor/dispatcher.js";
import { PolicyEngine } from "../policy/engine.js";
import { AppendOnlyAuditStore } from "../audit/store.js";
import { LocalAPIServer } from "../api/server.js";
import { SecretRedactor } from "../security/redactor.js";
import { AgentAction } from "../types/action.js";
import { Policy, PolicyDecision } from "../types/policy.js";
import { ApprovedAction } from "../types/executor.js";
import { AgentRuntime } from "../runtime/runtime.js";
import { LocalAuditLogger } from "../audit/logger.js";
import { SessionManager } from "../session/manager.js";
import { CapabilityRegistry as CoreCapabilityRegistry } from "../capability/registry.js";
import { ScriptedPlanProvider } from "../llm/scripted.provider.js";

// Vector storage import (remediated in OA-SEC-001)
import { FileSystemStorageBackend } from "@open-agent/vector";

// Network imports (remediated in OA-SEC-005)
import {
  IdentityManager,
  MessageAuthenticator,
  CapabilityInvocationHandler,
  PeerManager,
  CapabilityRegistry as NetworkCapabilityRegistry,
  LocalDirectTransport,
} from "@open-agent/network";

describe("Phase 9: Comprehensive Security Regression Suite (15 Test Cases)", () => {
  // 1. reject-unapproved-invocation
  it("Case 1: reject-unapproved-invocation - Executor rejects direct unapproved invocation", async () => {
    const dispatcher = new ExecutorDispatcher("master_hmac_secret");
    const fakeAction: ApprovedAction = {
      action: {
        id: "act_unapproved_1",
        sessionId: "sess_sec_1",
        type: "navigate",
        target: "https://example.com",
        parameters: {},
        timestamp: new Date().toISOString(),
        agentId: "agent_sec",
      },
      decision: {
        decision: "DENY",
        reason: "Access denied by default policy",
        timestamp: new Date().toISOString(),
      },
      approvalToken: "forged_token_value",
      approvedAt: new Date().toISOString(),
    };

    await assert.rejects(
      async () => {
        await dispatcher.dispatch(fakeAction);
      },
      {
        name: "SecurityViolationError",
        message: /policy decision is not ALLOW/,
      }
    );
  });

  // 2. reject-forged-approval-token
  it("Case 2: reject-forged-approval-token - Dispatcher rejects forged or unauthentic approval token", async () => {
    const dispatcher = new ExecutorDispatcher("production_secret_key_99");
    const action: AgentAction = {
      id: "act_forged_tok",
      sessionId: "sess_sec_2",
      type: "navigate",
      target: "https://docs.example.com",
      parameters: {},
      timestamp: new Date().toISOString(),
      agentId: "agent_sec",
    };

    const forgedContainer: ApprovedAction = {
      action,
      decision: { decision: "ALLOW", reason: "Legit looking", timestamp: new Date().toISOString() },
      approvalToken: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      approvedAt: new Date().toISOString(),
    };

    await assert.rejects(
      async () => {
        await dispatcher.dispatch(forgedContainer);
      },
      {
        name: "SecurityViolationError",
        message: /invalid or forged approval token/,
      }
    );
  });

  // 3. reject-mutated-approved-action
  it("Case 3: reject-mutated-approved-action - Dispatcher fails closed when action is mutated post-approval", async () => {
    const dispatcher = new ExecutorDispatcher("secret_binding_key");
    const approvedAt = new Date().toISOString();

    const originalAction: AgentAction = {
      id: "act_orig_3",
      sessionId: "sess_sec_3",
      type: "navigate",
      target: "https://docs.example.com",
      parameters: { mode: "readonly" },
      timestamp: approvedAt,
      agentId: "agent_sec",
    };

    const approvedContainer = dispatcher.createApprovedAction(
      originalAction,
      { decision: "ALLOW", reason: "Approved", timestamp: approvedAt },
      approvedAt
    );

    // Attacker modifies parameters post-approval
    const mutatedContainer: ApprovedAction = {
      ...approvedContainer,
      action: {
        ...approvedContainer.action,
        parameters: { mode: "transfer", amount: 1000000 },
      },
    };

    await assert.rejects(
      async () => {
        await dispatcher.dispatch(mutatedContainer);
      },
      {
        name: "SecurityViolationError",
      }
    );
  });

  // 4. reject-tampered-audit-record
  it("Case 4: reject-tampered-audit-record - Audit store detects record payload modification and corrupted lines (OA-SEC-007)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-tamper-test-"));
    const logFile = path.join(tmpDir, "audit.jsonl");

    const store = new AppendOnlyAuditStore(logFile);
    store.append({
      event_id: "evt_1",
      session_id: "sess_4",
      timestamp: new Date().toISOString(),
      action: "query",
      result: "success",
    });
    store.append({
      event_id: "evt_2",
      session_id: "sess_4",
      timestamp: new Date().toISOString(),
      action: "transfer",
      result: "success",
    });

    const initialVerification = store.verifyIntegrity();
    assert.strictEqual(initialVerification.valid, true);

    // Tamper with record in memory
    const entries = store.getEntries();
    entries[1].action = "tampered_action_name";

    const tamperedVerification = store.verifyIntegrity(entries);
    assert.strictEqual(tamperedVerification.valid, false);
    assert.strictEqual(tamperedVerification.brokenAtIndex, 1);

    // OA-SEC-007 test: Append corrupted non-JSON line directly to file
    fs.appendFileSync(logFile, "CORRUPTED_LINE_INJECTED_BY_ATTACKER\n", "utf-8");
    const reloadedStore = new AppendOnlyAuditStore(logFile);
    assert.strictEqual(reloadedStore.getCorruptedLineCount() > 0, true);
    const corruptedVerification = reloadedStore.verifyIntegrity();
    assert.strictEqual(corruptedVerification.valid, false);
    assert.match(corruptedVerification.reason || "", /corrupted or unparseable record/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 5. reject-audit-deletion
  it("Case 5: reject-audit-deletion - Audit store detects missing/deleted events in hash-chain", () => {
    const store = new AppendOnlyAuditStore();
    for (let i = 1; i <= 4; i++) {
      store.append({
        event_id: `evt_chain_${i}`,
        session_id: "sess_5",
        timestamp: new Date().toISOString(),
        action: `step_${i}`,
        result: "success",
      });
    }

    const allEntries = store.getEntries();
    assert.strictEqual(store.verifyIntegrity().valid, true);

    // Delete index 2 (the 3rd event)
    const truncatedEntries = [allEntries[0], allEntries[1], allEntries[3]];
    const check = store.verifyIntegrity(truncatedEntries);
    assert.strictEqual(check.valid, false);
  });

  // 6. prevent-unauthorized-action-execution
  it("Case 6: prevent-unauthorized-action-execution - Policy engine rejects unpermitted actions and domain spoofing (OA-SEC-002)", () => {
    const policy: Policy = {
      id: "policy_6",
      name: "Security Regression Policy",
      version: "1.0",
      defaultDecision: "DENY",
      allowedDomains: ["docs.example.com", "*.internal.net"],
      deniedDomains: ["malicious.org"],
      rules: [
        {
          id: "r1",
          actionType: "navigate",
          decision: "ALLOW",
          targetPattern: "*",
        },
      ],
    };

    const engine = new PolicyEngine();

    // 1. Direct allowed domain
    const r1 = engine.evaluate(
      {
        id: "a1",
        sessionId: "s6",
        type: "navigate",
        target: "https://docs.example.com/guide",
        parameters: {},
        timestamp: new Date().toISOString(),
        agentId: "ag",
      },
      policy
    );
    assert.strictEqual(r1.decision, "ALLOW");

    // 2. Wildcard subdomain match
    const r2 = engine.evaluate(
      {
        id: "a2",
        sessionId: "s6",
        type: "navigate",
        target: "https://portal.internal.net/dashboard",
        parameters: {},
        timestamp: new Date().toISOString(),
        agentId: "ag",
      },
      policy
    );
    assert.strictEqual(r2.decision, "ALLOW");

    // 3. OA-SEC-002: Suffix collision attempt must be DENIED
    const r3 = engine.evaluate(
      {
        id: "a3",
        sessionId: "s6",
        type: "navigate",
        target: "https://evil-docs.example.com",
        parameters: {},
        timestamp: new Date().toISOString(),
        agentId: "ag",
      },
      policy
    );
    assert.strictEqual(r3.decision, "DENY");

    // 4. Wildcard suffix collision attempt (fakeinternal.net)
    const r4 = engine.evaluate(
      {
        id: "a4",
        sessionId: "s6",
        type: "navigate",
        target: "https://fakeinternal.net/secret",
        parameters: {},
        timestamp: new Date().toISOString(),
        agentId: "ag",
      },
      policy
    );
    assert.strictEqual(r4.decision, "DENY");

    // 5. Explicitly denied domain
    const r5 = engine.evaluate(
      {
        id: "a5",
        sessionId: "s6",
        type: "navigate",
        target: "https://malicious.org/download",
        parameters: {},
        timestamp: new Date().toISOString(),
        agentId: "ag",
      },
      policy
    );
    assert.strictEqual(r5.decision, "DENY");
  });

  // 7. prevent-path-traversal-storage-and-backup
  it("Case 7: prevent-path-traversal-storage-and-backup - Storage backend blocks path traversal (OA-SEC-001)", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vector-traversal-test-"));
    const storage = new FileSystemStorageBackend(tmpDir);

    // Traversal attempts with ../ or invalid characters
    await assert.rejects(async () => {
      await storage.saveCollectionRecords("../../etc/shadow", []);
    }, /Security violation: Invalid or unsafe collection ID/);

    await assert.rejects(async () => {
      await storage.loadCollectionRecords("../bad_coll");
    }, /Security violation: Invalid or unsafe collection ID/);

    await assert.rejects(async () => {
      await storage.deleteCollection("coll;rm -rf /");
    }, /Security violation: Invalid or unsafe collection ID/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 8. enforce-origin-and-host-validation
  it("Case 8: enforce-origin-and-host-validation - Local API server blocks DNS rebinding & invalid Host headers (OA-SEC-003)", async () => {
    const policy: Policy = {
      id: "p_test",
      name: "P Test",
      version: "1.0",
      defaultDecision: "ALLOW",
      rules: [],
    };
    const policyEngine = new PolicyEngine();
    const auditLogger = new LocalAuditLogger();
    const runtime = new AgentRuntime({
      policyEngine,
      policy,
      capabilityRegistry: new CoreCapabilityRegistry(),
      dispatcher: new ExecutorDispatcher(),
      auditLogger,
      sessionManager: new SessionManager(),
      llmProvider: new ScriptedPlanProvider([]),
    });

    const server = new LocalAPIServer({ runtime, auditLogger });
    const port = await server.listen(0);

    // 1. Valid request to 127.0.0.1
    const validRes = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/health",
          method: "GET",
          headers: { Host: `127.0.0.1:${port}` },
        },
        (res) => resolve(res.statusCode || 0)
      );
      req.on("error", reject);
      req.end();
    });
    assert.strictEqual(validRes, 200);

    // 2. DNS Rebinding attempt with malicious Host header
    const blockedRes = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/health",
          method: "GET",
          headers: { Host: `attacker-controlled-site.com:${port}` },
        },
        (res) => resolve(res.statusCode || 0)
      );
      req.on("error", reject);
      req.end();
    });
    assert.strictEqual(blockedRes, 403);

    // 3. Subdomain confusion Host header
    const spoofedRes = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/health",
          method: "GET",
          headers: { Host: "localhost.evil.com" },
        },
        (res) => resolve(res.statusCode || 0)
      );
      req.on("error", reject);
      req.end();
    });
    assert.strictEqual(spoofedRes, 403);

    await server.close();
  });

  // 9. block-unauthorized-network-invocations
  it("Case 9: block-unauthorized-network-invocations - Capability invocation blocks unauthorized callers and denied capabilities", async () => {
    const alice = IdentityManager.generateKeyPair();
    const bob = IdentityManager.generateKeyPair();

    const aliceTransport = new LocalDirectTransport(alice.identity.agent_id);
    const registry = new NetworkCapabilityRegistry();
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

    await assert.rejects(
      () =>
        handler.invokeRemoteCapability({
          targetAgentId: bob.identity.agent_id,
          capabilityId: "document.search@1.0",
          input: { query: "test" },
        }),
      /Local policy denied capability invocation/
    );
  });

  // 10. verify-cryptographic-signatures
  it("Case 10: verify-cryptographic-signatures - Identity manager rejects forged Ed25519 signatures", () => {
    const kpA = IdentityManager.generateKeyPair();
    const kpB = IdentityManager.generateKeyPair();

    const message = "payload_requiring_integrity";
    const sigA = IdentityManager.sign(message, kpA.private_key);

    // Verify valid signature from Alice
    assert.strictEqual(IdentityManager.verify(message, sigA, kpA.identity.public_key), true);

    // Reject signature verified against Bob's key
    assert.strictEqual(IdentityManager.verify(message, sigA, kpB.identity.public_key), false);

    // Reject tampered message against Alice's signature
    assert.strictEqual(
      IdentityManager.verify("tampered_payload", sigA, kpA.identity.public_key),
      false
    );
  });

  // 11. enforce-nonce-replay-prevention
  it("Case 11: enforce-nonce-replay-prevention - Message authenticator rejects duplicate nonces", () => {
    const kp = IdentityManager.generateKeyPair();
    const auth = new MessageAuthenticator();

    const msg = auth.createMessage({
      senderKeyPair: kp,
      recipientAgentId: "agent_b",
      messageType: "PING",
      payload: { ping: true },
    });

    const v1 = auth.verifyMessage(msg, kp.identity.public_key);
    assert.strictEqual(v1.valid, true);

    // Replay with exact same nonce
    const v2 = auth.verifyMessage(msg, kp.identity.public_key);
    assert.strictEqual(v2.valid, false);
    assert.match(v2.error || "", /Replay attack detected/);
  });

  // 12. enforce-clock-skew-expiration
  it("Case 12: enforce-clock-skew-expiration - Message authenticator rejects expired timestamps", () => {
    const kp = IdentityManager.generateKeyPair();
    const auth = new MessageAuthenticator({ clock_skew_tolerance_ms: 60000 }); // 1 min tolerance

    const msg = auth.createMessage({
      senderKeyPair: kp,
      recipientAgentId: "agent_b",
      messageType: "PING",
      payload: { ping: true },
    });

    // Artificially age message by 2 hours
    msg.timestamp = new Date(Date.now() - 7200000).toISOString();
    // Resign with aged timestamp
    const payloadToSign = MessageAuthenticator.computeSigningPayload(msg);
    msg.signature = IdentityManager.sign(payloadToSign, kp.private_key);

    const v = auth.verifyMessage(msg, kp.identity.public_key);
    assert.strictEqual(v.valid, false);
    assert.match(v.error || "", /Message expired or clock skew exceeded/);
  });

  // 13. enforce-memory-safety-limits
  it("Case 13: enforce-memory-safety-limits - Message authenticator caps nonce cache size and evicts FIFO (OA-SEC-005)", () => {
    const kp = IdentityManager.generateKeyPair();
    const maxNonces = 10;
    const auth = new MessageAuthenticator({ max_cached_nonces: maxNonces });

    // Send 15 unique messages
    for (let i = 0; i < 15; i++) {
      const msg = auth.createMessage({
        senderKeyPair: kp,
        recipientAgentId: "agent_b",
        messageType: "PING",
        payload: { i },
      });
      const res = auth.verifyMessage(msg, kp.identity.public_key);
      assert.strictEqual(res.valid, true);
    }

    // Verify cache has not grown unbounded
    const internalCache = (auth as unknown as { seenNonces: Map<string, number> }).seenNonces;
    assert.strictEqual(internalCache.size <= maxNonces, true);
  });

  // 14. redact-secrets-in-audit-and-ui
  it("Case 14: redact-secrets-in-audit-and-ui - SecretRedactor masks API tokens and passwords", () => {
    const redactor = new SecretRedactor();

    const sensitiveText =
      "My key is sk-123456789012345678901234567890 and authorization is bearer super-secret-token";
    const redactedText = redactor.redactString(sensitiveText);

    assert.strictEqual(redactedText.includes("sk-123456789012345678901234567890"), false);
    assert.strictEqual(redactedText.includes("super-secret-token"), false);
    assert.match(redactedText, /\[REDACTED\]/);

    const objectWithSecrets = {
      username: "admin",
      password: "TopSecretPassword99!",
      token: "ghp_123456789012345678901234567890123456",
      authHeader:
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M",
    };

    const redactedObj = redactor.redactObject(objectWithSecrets) as Record<string, string>;
    assert.strictEqual(redactedObj.password, "[REDACTED]");
    assert.strictEqual(redactedObj.token.includes("ghp_"), false);
    assert.match(redactedObj.authHeader, /\[REDACTED\]/);
  });

  // 15. fail-closed-under-error-conditions
  it("Case 15: fail-closed-under-error-conditions - Runtime and policy engine fail closed on errors", async () => {
    const policy: Policy = {
      id: "policy_fail_closed",
      name: "Fail Closed Policy",
      version: "1.0",
      defaultDecision: "DENY",
      rules: [],
    };
    const policyEngine = new PolicyEngine();

    // Malformed action with empty/invalid type must throw ValidationError
    assert.throws(() => {
      policyEngine.evaluate(
        {
          id: "invalid_act",
          type: "",
        } as unknown as AgentAction,
        policy
      );
    }, /Action must contain a valid non-empty 'type' string/);

    // Runtime with denied policy halts session immediately
    const auditLogger = new LocalAuditLogger();
    const runtime = new AgentRuntime({
      policyEngine,
      policy,
      capabilityRegistry: new CoreCapabilityRegistry(),
      dispatcher: new ExecutorDispatcher(),
      auditLogger,
      sessionManager: new SessionManager(),
      llmProvider: new ScriptedPlanProvider([
        {
          id: "act_malicious",
          sessionId: "sess_temp",
          type: "navigate",
          target: "https://unauthorized-internal.corp",
          parameters: {},
          timestamp: new Date().toISOString(),
          agentId: "agent",
        },
      ]),
    });

    const session = runtime.startSession("Malicious Goal");
    const result = await runtime.step(session.id);

    assert.strictEqual(result.outcome, "DENIED");

    const events = auditLogger.getEntries();
    const lastEvent = events[events.length - 1];
    assert.strictEqual(lastEvent.stage, "ACTION_DENIED");
  });
});
