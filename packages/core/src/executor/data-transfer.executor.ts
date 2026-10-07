import { ActionResult } from "../types/action.js";
import { ApprovedAction, IExecutor } from "../types/executor.js";

export class DataTransferExecutor implements IExecutor {
  readonly id = "executor.data_transfer";
  readonly name = "Data Transfer Executor";

  canHandle(approved: ApprovedAction): boolean {
    const t = approved.action.type;
    return t === "download" || t === "upload";
  }

  async execute(approved: ApprovedAction): Promise<ActionResult> {
    const { action } = approved;
    const executedAt = new Date().toISOString();

    if (action.type === "download") {
      return {
        actionId: action.id,
        status: "SUCCESS",
        output: {
          downloadSource: action.target,
          simulatedBytes: 1024,
          completed: true,
        },
        executedAt,
      };
    }

    if (action.type === "upload") {
      return {
        actionId: action.id,
        status: "SUCCESS",
        output: {
          uploadDestination: action.target,
          simulatedBytes: 512,
          completed: true,
        },
        executedAt,
      };
    }

    return {
      actionId: action.id,
      status: "FAILURE",
      error: `Unsupported transfer action type '${action.type}'`,
      executedAt,
    };
  }
}
