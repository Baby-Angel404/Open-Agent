import { CapabilityDefinition } from "../types/capability.js";

export class UnknownCapabilityError extends Error {
  constructor(capabilityOrAction: string) {
    super(`Capability or action '${capabilityOrAction}' is not registered in capability registry`);
    this.name = "UnknownCapabilityError";
  }
}

export class CapabilityRegistry {
  private capabilities: Map<string, CapabilityDefinition> = new Map();
  private actionTypeMap: Map<string, CapabilityDefinition> = new Map();

  constructor(registerDefaults = true) {
    if (registerDefaults) {
      this.registerDefaultCapabilities();
    }
  }

  private registerDefaultCapabilities(): void {
    const defaults: CapabilityDefinition[] = [
      {
        id: "browser.navigate",
        name: "Navigate URL",
        description: "Navigates to a specific target URL",
        actionType: "navigate",
        isSensitive: false,
      },
      {
        id: "browser.read",
        name: "Read Content",
        description: "Reads textual content or DOM from target resource",
        actionType: "read",
        isSensitive: false,
      },
      {
        id: "browser.click",
        name: "Click Element",
        description: "Clicks on an interactive target element",
        actionType: "click",
        isSensitive: false,
      },
      {
        id: "browser.type",
        name: "Type Text",
        description: "Types input text into target input field",
        actionType: "type",
        isSensitive: false,
      },
      {
        id: "browser.select",
        name: "Select Option",
        description: "Selects an option from target select/menu element",
        actionType: "select",
        isSensitive: false,
      },
      {
        id: "browser.download",
        name: "Download File",
        description: "Initiates file download from target URL",
        actionType: "download",
        isSensitive: true,
      },
      {
        id: "browser.upload",
        name: "Upload File",
        description: "Uploads local data or file to target endpoint",
        actionType: "upload",
        isSensitive: true,
      },
      {
        id: "browser.submit",
        name: "Submit Form",
        description: "Submits target form element",
        actionType: "submit",
        isSensitive: true,
      },
    ];

    for (const cap of defaults) {
      this.register(cap);
    }
  }

  register(cap: CapabilityDefinition): void {
    this.capabilities.set(cap.id, cap);
    this.actionTypeMap.set(cap.actionType, cap);
  }

  get(id: string): CapabilityDefinition | undefined {
    return this.capabilities.get(id);
  }

  getByActionType(actionType: string): CapabilityDefinition | undefined {
    return this.actionTypeMap.get(actionType);
  }

  list(): CapabilityDefinition[] {
    return Array.from(this.capabilities.values());
  }

  has(id: string): boolean {
    return this.capabilities.has(id);
  }

  assertCapabilitySupported(actionType: string): CapabilityDefinition {
    const cap = this.getByActionType(actionType) || this.get(actionType);
    if (!cap) {
      throw new UnknownCapabilityError(actionType);
    }
    return cap;
  }
}
