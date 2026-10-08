import { IdentityManager } from "@open-agent/network";
import { createCliNetworkNode } from "./network.js";

export async function handlePeerList(options?: {
  format?: string;
  storageDir?: string;
}): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);
  const peers = node.getPeerManager().listPeers();

  if (options?.format === "json") {
    console.log(JSON.stringify(peers, null, 2));
    return;
  }

  console.log(`=== Known Peers (${peers.length}) ===`);
  if (peers.length === 0) {
    console.log("No peers discovered or registered yet.");
    return;
  }

  console.log(
    "AGENT ID".padEnd(24) +
      "TRUST".padEnd(12) +
      "REPUTATION".padEnd(12) +
      "CAPS".padEnd(8) +
      "ADDRESS"
  );
  console.log("-".repeat(70));
  for (const peer of peers) {
    const idShort = peer.agent_id.length > 22 ? peer.agent_id.slice(0, 21) + "…" : peer.agent_id;
    const rep = peer.reputation_score !== undefined ? String(peer.reputation_score) : "50 (init)";
    const capsCount = String(peer.capabilities?.length || 0);
    const addr = peer.addresses?.[0] || "none";
    console.log(
      idShort.padEnd(24) + peer.trust_state.padEnd(12) + rep.padEnd(12) + capsCount.padEnd(8) + addr
    );
  }
}

export async function handlePeerInspect(
  agentId: string,
  options?: { format?: string; storageDir?: string }
): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);
  const peer = node.getPeerManager().getPeer(agentId);

  if (!peer) {
    console.error(`[Error] Peer not found: ${agentId}`);
    process.exitCode = 1;
    return;
  }

  const rep = node.getReputationManager().getRecord(agentId);

  if (options?.format === "json") {
    console.log(JSON.stringify({ peer, reputation: rep }, null, 2));
    return;
  }

  console.log(`=== Peer Inspection: ${agentId} ===`);
  console.log(`Public Key:      ${peer.public_key}`);
  console.log(`Trust State:     ${peer.trust_state}`);
  console.log(`Reputation:      ${rep?.score ?? peer.reputation_score ?? 50} / 100`);
  console.log(`Addresses:       ${peer.addresses?.join(", ") || "none"}`);
  console.log(`Last Seen:       ${peer.last_seen}`);
  console.log(
    `Capabilities:    ${peer.capabilities?.map((c) => c.name).join(", ") || "none advertised"}`
  );
  if (rep) {
    const events = node.getReputationManager().getEvents(agentId);
    console.log(`Total Events:    ${events.length}`);
    console.log(`Successful:      ${rep.successful_requests}`);
    console.log(`Failed / Errors: ${rep.failed_requests + rep.invalid_messages}`);
  }
}

export async function handlePeerConnect(
  addressOrId: string,
  options?: { pubkey?: string; address?: string; storageDir?: string }
): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);

  let agentId = addressOrId;
  let pubkey = options?.pubkey;
  const addresses = options?.address ? [options.address] : [];

  if (addressOrId.startsWith("http://") || addressOrId.startsWith("https://")) {
    addresses.push(addressOrId);
    if (!pubkey) {
      console.error("[Error] --pubkey is required when connecting by URL directly.");
      process.exitCode = 1;
      return;
    }
  }

  if (!pubkey) {
    const kp = IdentityManager.generateKeyPair();
    pubkey = kp.identity.public_key;
    agentId = kp.identity.agent_id;
  } else if (!IdentityManager.verifyAgentIdMatchesPublicKey(agentId, pubkey)) {
    agentId = IdentityManager.deriveAgentId(pubkey);
  }

  const peer = node.getPeerManager().registerPeer({
    agent_id: agentId,
    public_key: pubkey,
    addresses,
  });

  await node.saveState();

  console.log(`[Success] Peer registered and connected.`);
  console.log(`Agent ID:    ${peer.agent_id}`);
  console.log(`Trust State: ${peer.trust_state} (Discovery != Trust)`);
  console.log(`Address:     ${peer.addresses?.[0] || "direct"}`);
}

export async function handlePeerDisconnect(
  agentId: string,
  options?: { storageDir?: string }
): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);
  const peer = node.getPeerManager().getPeer(agentId);

  if (!peer) {
    console.error(`[Error] Peer not found: ${agentId}`);
    process.exitCode = 1;
    return;
  }

  node.getPeerManager().updateConnectionStatus(agentId, "DISCONNECTED");
  await node.saveState();
  console.log(`[Success] Disconnected from peer ${agentId}.`);
}

export async function handlePeerBlock(
  agentId: string,
  options?: { reason?: string; storageDir?: string }
): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);
  const reason = options?.reason || "Manual administrative block via CLI";

  node.getPeerManager().blockPeer(agentId, reason);
  await node.saveState();

  console.log(`[Success] Peer ${agentId} has been BLOCKED.`);
  console.log(`Reason: ${reason}`);
  console.log(`All future messages and capability requests from this peer will be dropped.`);
}

export async function handlePeerUnblock(
  agentId: string,
  options?: { storageDir?: string }
): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);

  const unblocked = node.getPeerManager().unblockPeer(agentId);
  if (!unblocked) {
    console.log(`[Info] Peer ${agentId} was not in blocklist.`);
    return;
  }

  await node.saveState();
  console.log(`[Success] Peer ${agentId} has been UNBLOCKED.`);
}
