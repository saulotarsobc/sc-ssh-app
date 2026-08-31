import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  Notification,
  session,
  shell,
  Tray,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { displayName, repository } from "../package.json";
import { registerIpcHandlers } from "./utils/ipc";
import { createAppMenu } from "./utils/menu";
import { registerUpdateHandlers, setupAutoUpdater } from "./utils/updater";
import { SshManager } from "./services/manager";
import type { OperationProgress } from "../shared/contracts";

// === Path Configuration ===
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

export const MAIN_DIST = path.join(
  process.env.APP_ROOT,
  "..",
  "dist",
  "backend",
);

export const RENDERER_DIST = path.join(
  process.env.APP_ROOT,
  "..",
  "dist",
  "frontend",
);

// Public folder path (dev vs production)
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT!, "..", "public")
  : RENDERER_DIST;

// === Application State ===
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let manager: SshManager | null = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: `${displayName} - v${app.getVersion()}`,
    icon: path.join(process.env.VITE_PUBLIC, "icon.ico"),
    width: 1200,
    height: 800,
    minHeight: 600,
    minWidth: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url === repository.url ||
      url === repository.url.replace(/\.git$/, "")
    ) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });
  mainWindow.on("close", (event) => {
    if (!isQuitting && manager?.store.settings.minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

function broadcast(channel: string, value?: OperationProgress): void {
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send(channel, value);
}

function syncTray(): void {
  if (!manager?.store.settings.minimizeToTray) {
    tray?.destroy();
    tray = null;
    return;
  }
  if (tray) return;
  tray = new Tray(
    nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC, "icon.ico")),
  );
  tray.setToolTip(displayName);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  manager = new SshManager(
    app.getPath("userData"),
    (progress) => broadcast("manager:progress", progress),
    () => {
      broadcast("manager:changed");
      syncTray();
    },
  );
  await manager.initialize();
  registerIpcHandlers(manager);
  registerUpdateHandlers();
  createWindow();
  createAppMenu();
  syncTray();
  // After the window: update events are sent to open windows, and the check
  // starts as soon as the first one exists.
  setupAutoUpdater();
  const summary = await manager.dashboardSummary();
  if (summary.dueSoonCount > 0 && Notification.isSupported()) {
    new Notification({
      title: displayName,
      body: `${summary.dueSoonCount} SSH ${summary.dueSoonCount === 1 ? "key needs" : "keys need"} rotation soon.`,
    }).show();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !manager?.store.settings.minimizeToTray)
    app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  manager?.dispose();
});

app.on("second-instance", () => {
  // Focus main window if user tries to run a second instance
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.on("activate", () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});
