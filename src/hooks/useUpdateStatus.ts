import type { UpdateStatus } from "@/types/update";
import type { IpcRendererEvent } from "electron";
import { useEffect, useState } from "react";

/**
 * Tracks the auto-update progress pushed by the main process over the
 * `update:status` channel.
 *
 * Returns `null` outside Electron (e.g. `npm run preview` in a browser) and
 * whenever the check itself failed — a network hiccup is not something the
 * user needs a banner for, and the failure is already logged on the main
 * process console.
 */
export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    if (typeof window.ipcRenderer === "undefined") return;

    // The bridge's `on` is generic (`...args: unknown[]`) because it forwards
    // every IPC channel, not just this one — the cast is what recovers the
    // shape `backend/utils/updater` actually sends.
    const listener = (_event: IpcRendererEvent, ...args: unknown[]) => {
      const next = args[0] as UpdateStatus;
      setStatus(next.state === "error" ? null : next);
    };

    window.ipcRenderer.on("update:status", listener);
    return () => window.ipcRenderer.off("update:status", listener);
  }, []);

  return status;
}
