import { SubsystemLifecycle } from "../../lifecycle.js";
import {
  IPCResponse,
  NetworkStatusData,
  InvokeRemoteCapabilityParams,
} from "../../../types/ipc.js";
import { Capability } from "@open-agent/network";

export function handleNetworkStatus(lifecycle: SubsystemLifecycle): IPCResponse<NetworkStatusData> {
  const node = lifecycle.getNetworkNode();
  if (!node) {
    return {
      success: false,
      error: { code: "NETWORK_UNAVAILABLE", message: "Network node is not initialized" },
    };
  }

  const status = node.getStatus();
  const peers = node.getPeerManager().listPeers();
  const caps = node
    .getCapabilityRegistry()
    .list()
    .map((c: Capability) => c.name);

  return {
    success: true,
    data: {
      nodeId: status.agent_id,
      nodeName: "OpenAgent-Desktop-Node",
      listenPort: 4200,
      connectedPeers: peers.length,
      advertisedCapabilities: caps,
    },
  };
}

export function handleDiscoverPeers(lifecycle: SubsystemLifecycle): IPCResponse<unknown[]> {
  const node = lifecycle.getNetworkNode();
  if (!node) {
    return {
      success: false,
      error: { code: "NETWORK_UNAVAILABLE", message: "Network node is not initialized" },
    };
  }

  const peers = node.getPeerManager().listPeers();
  return { success: true, data: peers };
}

export async function handleInvokeRemote(
  lifecycle: SubsystemLifecycle,
  params: InvokeRemoteCapabilityParams
): Promise<IPCResponse<unknown>> {
  const node = lifecycle.getNetworkNode();
  if (!node) {
    return {
      success: false,
      error: { code: "NETWORK_UNAVAILABLE", message: "Network node is not initialized" },
    };
  }

  try {
    const result = await node.invokeRemoteCapability({
      targetAgentId: params.peerId,
      capabilityId: params.capabilityName,
      input: params.params,
      dataClassification: "INTERNAL",
    });
    return { success: true, data: result };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "REMOTE_INVOCATION_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
