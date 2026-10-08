import { SubsystemLifecycle } from "../../lifecycle.js";
import {
  IPCResponse,
  CreateSessionParams,
  RunTaskParams,
  ReviewApprovalParams,
  SessionSummary,
} from "../../../types/ipc.js";
import { Session } from "@open-agent/core";

export function handleListSessions(lifecycle: SubsystemLifecycle): IPCResponse<SessionSummary[]> {
  const runtime = lifecycle.getAgentRuntime();
  if (!runtime) {
    return {
      success: false,
      error: { code: "RUNTIME_UNAVAILABLE", message: "Agent runtime is not initialized" },
    };
  }

  const sessions: SessionSummary[] = runtime.listSessions().map((s: Session) => ({
    id: s.id,
    agentId: s.agentId,
    status: (s.status.toLowerCase() === "waiting_for_approval"
      ? "awaiting_approval"
      : s.status.toLowerCase()) as SessionSummary["status"],
    goal: s.task,
    createdAt: new Date(s.createdAt).getTime(),
    updatedAt: new Date(s.updatedAt).getTime(),
    eventsCount: s.history ? s.history.length : 0,
  }));

  return { success: true, data: sessions };
}

export function handleCreateSession(
  lifecycle: SubsystemLifecycle,
  params: CreateSessionParams
): IPCResponse<{ sessionId: string; status: string }> {
  const runtime = lifecycle.getAgentRuntime();
  if (!runtime) {
    return {
      success: false,
      error: { code: "RUNTIME_UNAVAILABLE", message: "Agent runtime is not initialized" },
    };
  }

  if (!params.goal || typeof params.goal !== "string" || params.goal.trim() === "") {
    return {
      success: false,
      error: { code: "INVALID_INPUT", message: "A non-empty goal is required" },
    };
  }

  try {
    const session = runtime.startSession(params.goal.trim(), params.agentId || "desktop_agent");
    return {
      success: true,
      data: { sessionId: session.id, status: session.status },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "SESSION_CREATION_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function handleRunTask(
  lifecycle: SubsystemLifecycle,
  params: RunTaskParams
): Promise<IPCResponse<{ result: unknown }>> {
  const runtime = lifecycle.getAgentRuntime();
  if (!runtime) {
    return {
      success: false,
      error: { code: "RUNTIME_UNAVAILABLE", message: "Agent runtime is not initialized" },
    };
  }

  try {
    const stepResult = await runtime.step(params.sessionId);
    return { success: true, data: { result: stepResult } };
  } catch (err: unknown) {
    return {
      success: false,
      error: { code: "STEP_FAILED", message: err instanceof Error ? err.message : String(err) },
    };
  }
}

export async function handleReviewApproval(
  lifecycle: SubsystemLifecycle,
  params: ReviewApprovalParams
): Promise<IPCResponse<{ updated: boolean }>> {
  const runtime = lifecycle.getAgentRuntime();
  if (!runtime) {
    return {
      success: false,
      error: { code: "RUNTIME_UNAVAILABLE", message: "Agent runtime is not initialized" },
    };
  }

  try {
    const responseType = params.approved ? "APPROVE" : "DENY";
    await runtime.respondToApproval(params.sessionId, responseType);
    return { success: true, data: { updated: true } };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "APPROVAL_RESPONSE_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export function handleGetHistory(
  lifecycle: SubsystemLifecycle,
  params: { sessionId: string }
): IPCResponse<{ events: unknown[] }> {
  const auditStore = lifecycle.getAuditStore();
  if (!auditStore) {
    return {
      success: false,
      error: { code: "AUDIT_UNAVAILABLE", message: "Audit store is not initialized" },
    };
  }

  try {
    const entries = auditStore.query({ sessionId: params.sessionId });
    return { success: true, data: { events: entries } };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "HISTORY_FETCH_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export function handleStopSession(
  lifecycle: SubsystemLifecycle,
  params: { sessionId: string; reason?: string }
): IPCResponse<{ stopped: boolean }> {
  const runtime = lifecycle.getAgentRuntime();
  if (!runtime) {
    return {
      success: false,
      error: { code: "RUNTIME_UNAVAILABLE", message: "Agent runtime is not initialized" },
    };
  }

  try {
    const stopped = runtime.emergencyStop(params.sessionId, params.reason || "Manual user stop");
    return { success: true, data: { stopped: !!stopped } };
  } catch (err: unknown) {
    return {
      success: false,
      error: { code: "STOP_FAILED", message: err instanceof Error ? err.message : String(err) },
    };
  }
}
