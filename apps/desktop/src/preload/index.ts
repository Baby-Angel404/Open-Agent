import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../types/ipc.js";

const ALLOWED_CHANNELS = new Set<string>(Object.values(IPC_CHANNELS));

export interface DesktopAPI {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  on: (channel: string, callback: (payload: unknown) => void) => () => void;
}

const api: DesktopAPI = {
  invoke: async (channel: string, payload?: unknown): Promise<unknown> => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      throw new Error(`Forbidden IPC channel invocation: ${channel}`);
    }
    return ipcRenderer.invoke(channel, payload);
  },
  on: (channel: string, callback: (payload: unknown) => void): (() => void) => {
    if (!channel.startsWith("event:")) {
      throw new Error(`Disallowed subscription channel: ${channel}`);
    }
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
};

contextBridge.exposeInMainWorld("openAgentDesktop", api);
