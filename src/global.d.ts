import type { IpcRendererEvent } from "electron";

declare global {
  interface Window {
    /** Typed bridge exposed by backend/preload.ts via contextBridge */
    ipcRenderer: {
      on(
        channel: string,
        listener: (event: IpcRendererEvent, ...args: unknown[]) => void,
      ): void;
      off(
        channel: string,
        listener: (event: IpcRendererEvent, ...args: unknown[]) => void,
      ): void;
      send(channel: string, ...args: unknown[]): void;
      invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
    };
  }
}

export {};
