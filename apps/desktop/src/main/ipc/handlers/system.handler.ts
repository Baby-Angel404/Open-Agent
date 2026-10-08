import { SubsystemLifecycle } from "../../lifecycle.js";
import { IPCResponse, SystemStatusData } from "../../../types/ipc.js";

export function handleSystemStatus(lifecycle: SubsystemLifecycle): IPCResponse<SystemStatusData> {
  try {
    const status = lifecycle.getStatus();
    return { success: true, data: status };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "SYSTEM_STATUS_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function handleSystemShutdown(
  lifecycle: SubsystemLifecycle
): Promise<IPCResponse<{ stopped: boolean }>> {
  try {
    await lifecycle.stop();
    return { success: true, data: { stopped: true } };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "SYSTEM_SHUTDOWN_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
