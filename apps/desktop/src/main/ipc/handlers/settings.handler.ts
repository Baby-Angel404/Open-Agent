import { SubsystemLifecycle } from "../../lifecycle.js";
import { IPCResponse, SetSecretParams } from "../../../types/ipc.js";
import { DesktopSettings } from "../../../types/settings.js";

export function handleGetSettings(lifecycle: SubsystemLifecycle): IPCResponse<DesktopSettings> {
  return { success: true, data: lifecycle.getSettings() };
}

export async function handleSaveSettings(
  lifecycle: SubsystemLifecycle,
  settings: Partial<DesktopSettings>
): Promise<IPCResponse<DesktopSettings>> {
  try {
    const updated = await lifecycle.updateSettings(settings);
    return { success: true, data: updated };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "SETTINGS_SAVE_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function handleVaultSetSecret(
  lifecycle: SubsystemLifecycle,
  params: SetSecretParams
): Promise<IPCResponse<{ saved: boolean; key: string }>> {
  const vault = lifecycle.getVault();
  if (!vault) {
    return {
      success: false,
      error: { code: "VAULT_UNAVAILABLE", message: "Credential vault is not initialized" },
    };
  }

  if (!params.key || !params.secret) {
    return {
      success: false,
      error: { code: "INVALID_INPUT", message: "Key and secret are required" },
    };
  }

  try {
    await vault.setSecret(params.key, params.secret);
    return { success: true, data: { saved: true, key: params.key } };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "VAULT_WRITE_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function handleVaultHasSecret(
  lifecycle: SubsystemLifecycle,
  params: { key: string }
): Promise<IPCResponse<{ exists: boolean; key: string }>> {
  const vault = lifecycle.getVault();
  if (!vault) {
    return {
      success: false,
      error: { code: "VAULT_UNAVAILABLE", message: "Credential vault is not initialized" },
    };
  }

  try {
    const exists = await vault.hasSecret(params.key);
    return { success: true, data: { exists, key: params.key } };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "VAULT_CHECK_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function handleVaultDeleteSecret(
  lifecycle: SubsystemLifecycle,
  params: { key: string }
): Promise<IPCResponse<{ deleted: boolean; key: string }>> {
  const vault = lifecycle.getVault();
  if (!vault) {
    return {
      success: false,
      error: { code: "VAULT_UNAVAILABLE", message: "Credential vault is not initialized" },
    };
  }

  try {
    const deleted = await vault.deleteSecret(params.key);
    return { success: true, data: { deleted, key: params.key } };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "VAULT_DELETE_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
