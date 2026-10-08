import { SubsystemLifecycle } from "../../lifecycle.js";
import { IPCResponse, BrowserNavigateParams, BrowserActionParams } from "../../../types/ipc.js";
import { AgentAction } from "@open-agent/core";

export async function handleBrowserNavigate(
  lifecycle: SubsystemLifecycle,
  params: BrowserNavigateParams
): Promise<IPCResponse<{ navigated: boolean; url: string }>> {
  const runtime = lifecycle.getAgentRuntime();
  const policyEngine = lifecycle.getPolicyEngine();
  if (!runtime || !policyEngine) {
    return {
      success: false,
      error: {
        code: "RUNTIME_UNAVAILABLE",
        message: "Agent runtime or policy engine is not initialized",
      },
    };
  }

  // Validate URL format
  try {
    const parsed = new URL(params.url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        success: false,
        error: { code: "INVALID_URL", message: "Only HTTP and HTTPS URLs are permitted" },
      };
    }
  } catch {
    return { success: false, error: { code: "INVALID_URL", message: "Invalid URL format" } };
  }

  const action: AgentAction = {
    id: `nav_${Date.now()}`,
    sessionId: params.sessionId,
    type: "navigate",
    target: params.url,
    timestamp: new Date().toISOString(),
  };

  const decision = policyEngine.evaluate(action, runtime.getPolicy());
  if (decision && decision.decision !== "ALLOW") {
    return {
      success: false,
      error: {
        code: "POLICY_VIOLATION",
        message: `Navigation denied by policy: ${decision.reason}`,
      },
    };
  }

  return { success: true, data: { navigated: true, url: params.url } };
}

export async function handleBrowserAction(
  lifecycle: SubsystemLifecycle,
  params: BrowserActionParams
): Promise<IPCResponse<{ executed: boolean; action: string }>> {
  const runtime = lifecycle.getAgentRuntime();
  const policyEngine = lifecycle.getPolicyEngine();
  if (!runtime || !policyEngine) {
    return {
      success: false,
      error: {
        code: "RUNTIME_UNAVAILABLE",
        message: "Agent runtime or policy engine is not initialized",
      },
    };
  }

  const action: AgentAction = {
    id: `act_${Date.now()}`,
    sessionId: params.sessionId,
    type: params.action,
    parameters: { selector: params.selector, text: params.text },
    timestamp: new Date().toISOString(),
  };

  const decision = policyEngine.evaluate(action, runtime.getPolicy());
  if (decision.decision !== "ALLOW") {
    return {
      success: false,
      error: { code: "POLICY_VIOLATION", message: `Action denied by policy: ${decision.reason}` },
    };
  }

  return { success: true, data: { executed: true, action: params.action } };
}

export function handleBrowserStatus(): IPCResponse<{ ready: boolean; activeSessions: number }> {
  return { success: true, data: { ready: true, activeSessions: 0 } };
}
