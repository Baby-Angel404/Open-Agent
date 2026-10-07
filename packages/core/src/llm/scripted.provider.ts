import { AgentAction } from "../types/action.js";
import { LLMProvider, ActionProposalContext } from "../types/llm.js";

export class ScriptedPlanProvider implements LLMProvider {
  readonly id = "provider.scripted";
  readonly name = "Scripted Action Plan Provider";

  private planQueue: AgentAction[] = [];

  constructor(initialPlan: AgentAction[] = []) {
    this.planQueue = [...initialPlan];
  }

  enqueue(action: AgentAction): void {
    this.planQueue.push(action);
  }

  enqueueMultiple(actions: AgentAction[]): void {
    this.planQueue.push(...actions);
  }

  async proposeAction(_context: ActionProposalContext): Promise<AgentAction | null> {
    if (this.planQueue.length === 0) {
      return null; // Plan finished
    }
    return this.planQueue.shift() || null;
  }
}
