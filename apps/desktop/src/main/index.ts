import { app, BrowserWindow, ipcMain, session } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { SubsystemLifecycle } from "./lifecycle.js";
import { IPCDispatcher } from "./ipc/dispatcher.js";
import { IPC_CHANNELS } from "../types/ipc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let lifecycle: SubsystemLifecycle | null = null;
let dispatcher: IPCDispatcher | null = null;

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // 1. Determine data directory
    const appDataPath =
      process.env.OPENAGENT_DESKTOP_DATA_DIR || path.join(app.getPath("userData"), "openagent");

    // 2. Start Subsystem Lifecycle
    lifecycle = new SubsystemLifecycle(appDataPath);
    await lifecycle.start();

    // 3. Register IPC Dispatcher
    dispatcher = new IPCDispatcher(lifecycle);
    for (const channel of Object.values(IPC_CHANNELS)) {
      if (!channel.startsWith("event:")) {
        ipcMain.handle(channel, async (_event, payload) => {
          return dispatcher!.dispatch(channel, payload);
        });
      }
    }

    // 4. Harden Session Permissions
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      // Deny all unsolicited web permissions (camera, mic, geolocation, notifications)
      callback(false);
    });

    // 5. Create Secure Window
    const preloadPath = path.resolve(__dirname, "../preload/index.js");
    const rendererPath = path.resolve(__dirname, "../../src/renderer/index.html");

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 850,
      minWidth: 900,
      minHeight: 600,
      backgroundColor: "#0f172a",
      title: "OpenAgent Infrastructure",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: preloadPath,
      },
    });

    // Open link in external browser or block navigation out of renderer
    mainWindow.webContents.setWindowOpenHandler(() => {
      return { action: "deny" };
    });

    await mainWindow.loadFile(rendererPath);

    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  });

  app.on("window-all-closed", async () => {
    if (process.platform !== "darwin") {
      if (lifecycle) {
        await lifecycle.stop();
      }
      app.quit();
    }
  });

  app.on("before-quit", async () => {
    if (lifecycle) {
      await lifecycle.stop();
    }
  });
}
