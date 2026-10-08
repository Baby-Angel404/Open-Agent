import test from "node:test";
import assert from "node:assert";
import { performance } from "node:perf_hooks";
import { AppendOnlyAuditStore } from "../audit/store.js";
import { PolicyEngine } from "../policy/engine.js";
import { Policy } from "../types/policy.js";
import { AgentAction } from "../types/action.js";

test("Performance Benchmark: Append throughput and hash chain verification throughput", () => {
  const store = new AppendOnlyAuditStore();
  const iterations = 1000;

  // 1. Measure append throughput
  const startAppend = performance.now();
  for (let i = 0; i < iterations; i++) {
    store.append({
      event_id: `evt_bench_${i}`,
      session_id: "sess_bench",
      agent_id: "agent_bench",
      timestamp: new Date().toISOString(),
      event_type: "ACTION_EXECUTED",
      action: "navigate",
      target: "https://docs.example.com",
      result: "success",
    });
  }
  const appendDuration = performance.now() - startAppend;
  const appendOpsPerSec = Math.round((iterations / appendDuration) * 1000);

  // 2. Measure verification throughput
  const startVerify = performance.now();
  const verification = store.verifyIntegrity();
  const verifyDuration = performance.now() - startVerify;
  const verifyOpsPerSec = Math.round((iterations / verifyDuration) * 1000);

  assert.strictEqual(verification.valid, true);
  assert.strictEqual(verification.totalEntries, iterations);

  // Throughput assertions: ensure reasonable baseline performance
  assert.ok(
    appendOpsPerSec > 1000,
    `Append throughput must exceed 1000 events/sec (actual: ${appendOpsPerSec}/sec)`
  );
  assert.ok(
    verifyOpsPerSec > 2000,
    `Verify throughput must exceed 2000 events/sec (actual: ${verifyOpsPerSec}/sec)`
  );
});

test("Performance Benchmark: Policy evaluation latency distribution under load", () => {
  const engine = new PolicyEngine();
  const policy: Policy = {
    id: "benchmark_policy",
    name: "Benchmark Policy",
    version: "1.0.0",
    defaultDecision: "DENY",
    allowedDomains: ["docs.example.com", "api.example.com"],
    rules: [
      {
        id: "r1",
        actionType: "navigate",
        decision: "ALLOW",
        targetPattern: "*",
      },
      {
        id: "r2",
        actionType: "click",
        decision: "ALLOW",
        targetPattern: "button#submit",
      },
      {
        id: "r3",
        actionType: "read",
        decision: "ALLOW",
        targetPattern: "https://docs.example.com/*",
      },
    ],
  };

  const action: AgentAction = {
    id: "act_bench",
    sessionId: "sess_bench",
    type: "navigate",
    target: "https://docs.example.com/guide",
    parameters: {},
    timestamp: new Date().toISOString(),
    agentId: "agent_bench",
  };

  const iterations = 5000;
  const latencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    engine.evaluate(action, policy);
    const dur = performance.now() - t0;
    latencies.push(dur);
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(iterations * 0.5)];
  const p95 = latencies[Math.floor(iterations * 0.95)];
  const p99 = latencies[Math.floor(iterations * 0.99)];

  // Assert latencies are well within SLA limits (p95 < 2ms)
  assert.ok(
    p95 < 2.0,
    `p95 policy evaluation latency should be under 2.0ms (actual: ${p95.toFixed(3)}ms)`
  );
  assert.ok(
    p50 < 0.5,
    `p50 policy evaluation latency should be under 0.5ms (actual: ${p50.toFixed(3)}ms)`
  );
});
