import type { UpdateStatus } from "../../shared/contracts";
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
    if (typeof window.sshManager === "undefined") return;
    return window.sshManager.updates.onStatus((next) => {
      setStatus(next.state === "error" ? null : next);
    });
  }, []);

  return status;
}
