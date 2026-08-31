import type { SshManagerApi } from "../shared/contracts";

declare global {
  interface Window {
    /** Typed bridge exposed by backend/preload.ts via contextBridge. */
    sshManager: SshManagerApi;
  }
}

export {};
