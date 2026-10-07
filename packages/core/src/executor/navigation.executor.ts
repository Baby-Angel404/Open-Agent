import { ActionResult } from "../types/action.js";
import { ApprovedAction, IExecutor } from "../types/executor.js";

export class NavigationExecutor implements IExecutor {
  readonly id = "executor.navigation";
  readonly name = "Navigation & Read Executor";

  canHandle(approved: ApprovedAction): boolean {
    return approved.action.type === "navigate" || approved.action.type === "read";
  }

  async execute(approved: ApprovedAction): Promise<ActionResult> {
    const { action } = approved;
    const executedAt = new Date().toISOString();

    if (action.type === "navigate") {
      return {
        actionId: action.id,
        status: "SUCCESS",
        output: {
          navigatedTo: action.target,
          statusCode: 200,
          ready: true,
        },
        executedAt,
      };
    }

    if (action.type === "read") {
      return {
        actionId: action.id,
        status: "SUCCESS",
        output: {
          resource: action.target,
          content: `Simulated local content read from ${action.target}`,
          length: 42,
        },
        executedAt,
      };
    }

    return {
      actionId: action.id,
      status: "FAILURE",
      error: `Unsupported action type '${action.type}' in NavigationExecutor`,
      executedAt,
    };
  }
}
