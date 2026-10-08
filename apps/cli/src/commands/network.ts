import * as path from "node:path";
import { NetworkNode } from "@open-agent/network";
import { getAuditLogPath } from "./audit.js";
import { AppendOnlyAuditStore } from "@open-agent/core";

export function getNetworkStoreDir(customDir?: string): string {
  if (customDir) {
    return path.resolve(process.cwd(), customDir);
  }
  return path.resolve(process.cwd(), ".network-store");
}

export async function createCliNetworkNode(storageDir?: string): Promise<NetworkNode> {
  const dir = getNetworkStoreDir(storageDir);
  const auditPath = getAuditLogPath();
  const auditStore = new AppendOnlyAuditStore(auditPath);
  const node = new NetworkNode({
    storageDir: dir,
    auditStore,
  });
  await node.start();
  return node;
}

export async function handleNetworkStatus(options?: { storageDir?: string }): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);
  const status = node.getStatus();
  const identity = node.getIdentity();

  console.log("=== OpenAgent Decentralized Network Status ===");
  console.log(`Agent ID:              ${identity.agent_id}`);
  console.log(`Public Key:            ${identity.public_key}`);
  console.log(`Algorithm:             ${identity.key_algorithm}`);
  console.log(`Transport Status:      ${status.transport_status}`);
  console.log(`Active Peers:          ${status.peers_count}`);
  console.log(`Blocked Peers:         ${status.blocked_peers_count}`);
  console.log(`Registered Caps:       ${status.capabilities_count}`);
  console.log(`Reputation Records:    ${status.reputation_records_count}`);
  console.log(`Policy Gatekeeper:     ACTIVE (Deterministic Local Evaluation)`);
  console.log(`Storage Location:      ${getNetworkStoreDir(options?.storageDir)}`);
}
