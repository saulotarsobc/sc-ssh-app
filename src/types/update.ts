// Single source of truth for the update status payload lives in the
// Electron backend. Type-only re-export so the renderer can import it via
// "@/types/update".
export type { UpdateStatus } from "../../backend/utils/updater";
