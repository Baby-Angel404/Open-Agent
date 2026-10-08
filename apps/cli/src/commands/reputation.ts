import { createCliNetworkNode } from "./network.js";

export async function handleReputationShow(
  agentId: string,
  options?: { format?: string; storageDir?: string }
): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);
  const rec = node.getReputationManager().getRecord(agentId);

  if (!rec) {
    console.log(`[Info] No reputation history recorded for agent ${agentId}.`);
    console.log(`Default initial trust score: 50 / 100`);
    return;
  }

  if (options?.format === "json") {
    console.log(JSON.stringify(rec, null, 2));
    return;
  }

  console.log(`=== Reputation Record: ${agentId} ===`);
  console.log(`Current Score:       ${rec.score} / 100`);
  console.log(`Successful Requests: ${rec.successful_requests}`);
  console.log(
    `Failures / Errors:   ${rec.failed_requests + rec.invalid_messages + rec.policy_violations}`
  );
  console.log(`Last Updated:        ${rec.updated_at}`);

  const events = node.getReputationManager().getEvents(agentId);
  if (events.length > 0) {
    console.log("\nRecent Evidence Trail:");
    console.log("TIMESTAMP".padEnd(26) + "TYPE".padEnd(24) + "DELTA".padEnd(8) + "EVIDENCE REF");
    console.log("-".repeat(80));

    const recent = events.slice(-10).reverse();
    for (const ev of recent) {
      const deltaStr = ev.score_delta > 0 ? `+${ev.score_delta}` : `${ev.score_delta}`;
      console.log(
        ev.timestamp.slice(0, 24).padEnd(26) +
          ev.event_type.padEnd(24) +
          deltaStr.padEnd(8) +
          ev.evidence_reference
      );
    }
  }
}
