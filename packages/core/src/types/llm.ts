import { AgentAction } from "./action.js";
import { Session } from "./agent.js";
import { CapabilityDefinition } from "./capability.js";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ActionProposalContext {
  session: Session;
  task: string;
  availableCapabilities: CapabilityDefinition[];
  lastResult?: unknown;
}

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  proposeAction(context: ActionProposalContext): Promise<AgentAction | null>;
}
