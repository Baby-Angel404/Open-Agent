import { ActionResult } from "../types/action.js";
import { ApprovedAction, IExecutor } from "../types/executor.js";

export class InteractionExecutor implements IExecutor {
  readonly id = "executor.interaction";
  readonly name = "DOM Interaction Executor";

  canHandle(approved: ApprovedAction): boolean {
    const t = approved.action.type;
    return t === "click" || t === "type" || t === "select" || t === "submit";
  }

  async execute(approved: ApprovedAction): Promise<ActionResult> {
    const { action } = approved;
    const executedAt = new Date().toISOString();

    switch (action.type) {
      case "click":
        return {
          actionId: action.id,
          status: "SUCCESS",
          output: { clicked: action.target },
          executedAt,
        };
      case "type":
        return {
          actionId: action.id,
          status: "SUCCESS",
          output: {
            typedInto: action.target,
            textLength:
              typeof action.parameters?.text === "string" ? action.parameters.text.length : 0,
          },
          executedAt,
        };
      case "select":
        return {
          actionId: action.id,
          status: "SUCCESS",
          output: {
            selectedTarget: action.target,
            value: action.parameters?.value,
          },
          executedAt,
        };
      case "submit":
        return {
          actionId: action.id,
          status: "SUCCESS",
          output: {
            submittedForm: action.target,
          },
          executedAt,
        };
      default:
        return {
          actionId: action.id,
          status: "FAILURE",
          error: `Unsupported interaction type '${action.type}'`,
          executedAt,
        };
    }
  }
}
