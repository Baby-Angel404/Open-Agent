import { SubsystemLifecycle } from "../../lifecycle.js";
import {
  IPCResponse,
  CreateBackupParams,
  RestoreBackupParams,
  BackupVerificationData,
} from "../../../types/ipc.js";

export async function handleCreateBackup(
  lifecycle: SubsystemLifecycle,
  params: CreateBackupParams
): Promise<IPCResponse<{ created: boolean; destinationPath: string; checksum: string }>> {
  const backupEngine = lifecycle.getBackupEngine();
  if (!backupEngine) {
    return {
      success: false,
      error: { code: "BACKUP_UNAVAILABLE", message: "Backup engine is not initialized" },
    };
  }

  try {
    const manifest = await backupEngine.createBackup(params.destinationPath, {
      includeAudit: params.includeAuditLogs,
      includeKnowledgeBase: params.includeKnowledgeBase,
      includeSettings: true,
    });

    return {
      success: true,
      data: {
        created: true,
        destinationPath: params.destinationPath,
        checksum: manifest.checksum,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "BACKUP_CREATION_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function handleVerifyBackup(
  lifecycle: SubsystemLifecycle,
  params: { backupFilePath: string }
): Promise<IPCResponse<BackupVerificationData>> {
  const backupEngine = lifecycle.getBackupEngine();
  if (!backupEngine) {
    return {
      success: false,
      error: { code: "BACKUP_UNAVAILABLE", message: "Backup engine is not initialized" },
    };
  }

  try {
    const result = await backupEngine.verifyBackup(params.backupFilePath);
    if (!result.valid || !result.manifest) {
      return {
        success: false,
        error: {
          code: "VERIFICATION_FAILED",
          message: result.error || "Backup verification failed",
        },
      };
    }

    return {
      success: true,
      data: {
        valid: true,
        manifest: {
          version: result.manifest.version,
          createdAt: result.manifest.createdAt,
          subsystems: ["audit", "vector", "graph", "settings"],
          checksum: result.manifest.checksum,
        },
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "VERIFICATION_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function handleRestoreBackup(
  lifecycle: SubsystemLifecycle,
  params: RestoreBackupParams
): Promise<IPCResponse<{ restored: boolean; restoredFilesCount: number }>> {
  const backupEngine = lifecycle.getBackupEngine();
  if (!backupEngine) {
    return {
      success: false,
      error: { code: "BACKUP_UNAVAILABLE", message: "Backup engine is not initialized" },
    };
  }

  try {
    const result = await backupEngine.restoreBackup(
      params.backupFilePath,
      params.overwriteExisting
    );
    return {
      success: true,
      data: {
        restored: true,
        restoredFilesCount: result.restoredFiles,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: { code: "RESTORE_FAILED", message: err instanceof Error ? err.message : String(err) },
    };
  }
}
