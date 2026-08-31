// Single source of truth for IPC payload types lives in the Electron backend.
// Type-only re-export so the renderer can import them via "@/types/ipc".
export type { SystemInfo, SystemMetrics } from "../../backend/utils/ipc";
