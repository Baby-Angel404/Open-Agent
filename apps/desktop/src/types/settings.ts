export interface DesktopSettings {
  general: {
    theme: "dark" | "light" | "system";
    language: string;
    autoCheckUpdates: boolean;
    startAtLogin: boolean;
    minimizeToTray: boolean;
  };
  security: {
    enforceStrictPolicy: boolean;
    requireApprovalForDangerousActions: boolean;
    allowRemoteCapabilityExecution: boolean;
    maxConcurrentSessions: number;
    auditLogRetentionDays: number;
  };
  storage: {
    dataDirectory: string;
    vectorStoreDirectory: string;
    graphStoreDirectory: string;
    auditStoreDirectory: string;
  };
  network: {
    nodeName: string;
    listenPort: number;
    bootstrapPeers: string[];
    enableDiscovery: boolean;
  };
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  general: {
    theme: "dark",
    language: "en",
    autoCheckUpdates: false,
    startAtLogin: false,
    minimizeToTray: false,
  },
  security: {
    enforceStrictPolicy: true,
    requireApprovalForDangerousActions: true,
    allowRemoteCapabilityExecution: false,
    maxConcurrentSessions: 5,
    auditLogRetentionDays: 90,
  },
  storage: {
    dataDirectory: "",
    vectorStoreDirectory: "",
    graphStoreDirectory: "",
    auditStoreDirectory: "",
  },
  network: {
    nodeName: "OpenAgent-Desktop-Node",
    listenPort: 4200,
    bootstrapPeers: [],
    enableDiscovery: true,
  },
};
