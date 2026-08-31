import { app, BrowserWindow, ipcMain } from "electron";
import electronUpdater from "electron-updater";

/**
 * Update progress, pushed to the renderer over the `update:status` channel.
 *
 * The same contract lives in `src/types/update.ts` — change one, change the
 * other.
 */
export type UpdateStatus =
  | { state: "available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

// electron-updater is CJS and this main process ships as ESM: a named import
// depends on Node's export detection, which does not see the
// `Object.defineProperty` the package uses. Importing the default and reading
// the property off it works under both formats. The read is deferred because
// `autoUpdater` is a getter that instantiates the platform-specific updater —
// in dev, where none of this runs, it never even happens.
const updater = () => electronUpdater.autoUpdater;

function broadcast(status: UpdateStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("update:status", status);
  }
}

/**
 * Checks the GitHub releases configured under `publish` (generated in
 * electron-builder.json from the `repository` field of package.json).
 *
 * Only makes sense when packaged: in dev there is no `app-update.yml` and
 * electron-updater would throw just from trying to read it.
 */
export function setupAutoUpdater(): void {
  if (!app.isPackaged) return;

  const autoUpdater = updater();

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) =>
    broadcast({ state: "available", version: info.version }),
  );
  autoUpdater.on("download-progress", (progress) =>
    broadcast({ state: "downloading", percent: progress.percent }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    broadcast({ state: "downloaded", version: info.version }),
  );
  autoUpdater.on("error", (err) =>
    broadcast({ state: "error", message: err.message }),
  );

  autoUpdater
    .checkForUpdates()
    .catch((err) => console.error("[updater] checkForUpdates failed:", err));
}

/**
 * Registers the `update:install` handler used by the renderer's "Restart and
 * install" button, over the same generic `ipcRenderer.invoke` bridge used by
 * every other channel (see `backend/utils/ipc`).
 */
export function registerUpdateHandlers(): void {
  ipcMain.handle("update:install", () => updater().quitAndInstall());
}
