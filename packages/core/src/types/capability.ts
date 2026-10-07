import { ActionType } from "./action.js";

export interface CapabilityDefinition {
  id: string; // e.g. "browser.navigate"
  name: string;
  description: string;
  actionType: ActionType;
  isSensitive: boolean;
  requiredParameters?: string[];
  schema?: Record<string, unknown>;
}
