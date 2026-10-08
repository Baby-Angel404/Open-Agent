import { SubsystemLifecycle } from "../../lifecycle.js";
import { IPCResponse, RegisterCapabilityParams } from "../../../types/ipc.js";
import { RiskLevel } from "@open-agent/network";

export function handleListCapabilities(lifecycle: SubsystemLifecycle): IPCResponse<unknown[]> {
  const node = lifecycle.getNetworkNode();
  if (!node) {
    return {
      success: false,
      error: { code: "NETWORK_UNAVAILABLE", message: "Network node is not initialized" },
    };
  }

  const list = node.getCapabilityRegistry().list();
  return { success: true, data: list };
}

export function handleRegisterCapability(
  lifecycle: SubsystemLifecycle,
  params: RegisterCapabilityParams
): IPCResponse<{ registered: boolean; name: string }> {
  const node = lifecycle.getNetworkNode();
  if (!node) {
    return {
      success: false,
      error: { code: "NETWORK_UNAVAILABLE", message: "Network node is not initialized" },
    };
  }

  try {
    const risk = params.riskLevel.toUpperCase() as RiskLevel;
    node.registerCapability({
      capability_id: `cap_${params.name}`,
      name: params.name,
      version: params.version,
      description: params.description,
      risk_level: risk,
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      required_permissions: [],
      provider_agent_id: node.getIdentity().agent_id,
      availability: "ONLINE",
    });

    return { success: true, data: { registered: true, name: params.name } };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "REGISTRATION_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
