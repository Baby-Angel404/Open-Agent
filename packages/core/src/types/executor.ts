import { AgentAction, ActionResult } from "./action.js";
import { PolicyDecision } from "./policy.js";

export interface ApprovedAction {
  action: Readonly<AgentAction>;
  decision: Readonly<PolicyDecision>;
  approvalToken: string;
  approvedAt: string;
}

export interface IExecutor {
  readonly id: string;
  readonly name: string;
  canHandle(action: ApprovedAction): boolean;
  execute(approvedAction: ApprovedAction): Promise<ActionResult>;
}
