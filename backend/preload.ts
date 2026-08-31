import { contextBridge, ipcRenderer } from "electron";
import type {
  OperationProgress,
  SshManagerApi,
  UpdateStatus,
} from "../shared/contracts";

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api: SshManagerApi = {
  dashboard: { summary: () => invoke("manager:dashboard:summary") },
  keys: {
    list: (includeArchived) => invoke("manager:keys:list", includeArchived),
    create: (input) => invoke("manager:keys:create", input),
    import: (input) => invoke("manager:keys:import", input),
    update: (input) => invoke("manager:keys:update", input),
    archive: (id) => invoke("manager:keys:archive", id),
    restore: (id) => invoke("manager:keys:restore", id),
    deletePermanently: (id) => invoke("manager:keys:delete", id),
    copyPublic: (id) => invoke("manager:keys:copy-public", id),
    exportPublic: (id) => invoke("manager:keys:export-public", id),
    reveal: (id) => invoke("manager:keys:reveal", id),
    pickImportFile: () => invoke("manager:keys:pick-import"),
  },
  hosts: {
    list: () => invoke("manager:hosts:list"),
    setup: (input) => invoke("manager:hosts:setup", input),
    save: (input) => invoke("manager:hosts:save", input),
    remove: (id) => invoke("manager:hosts:remove", id),
    test: (id, credentials) => invoke("manager:hosts:test", id, credentials),
    installKey: (id, credentials) =>
      invoke("manager:hosts:install-key", id, credentials),
    openTerminal: (id) => invoke("manager:hosts:open-terminal", id),
  },
  config: {
    read: () => invoke("manager:config:read"),
    preview: (content) => invoke("manager:config:preview", content),
    previewOrganize: () => invoke("manager:config:preview-organize"),
    apply: (content, reason) => invoke("manager:config:apply", content, reason),
    organize: () => invoke("manager:config:organize"),
    backups: () => invoke("manager:config:backups"),
    restore: (id) => invoke("manager:config:restore", id),
  },
  rotations: {
    list: () => invoke("manager:rotations:list"),
    run: (input) => invoke("manager:rotations:run", input),
  },
  agent: {
    status: () => invoke("manager:agent:status"),
    add: (keyId) => invoke("manager:agent:add", keyId),
    remove: (fingerprint) => invoke("manager:agent:remove", fingerprint),
  },
  activity: { list: (limit) => invoke("manager:activity:list", limit) },
  diagnostics: { run: () => invoke("manager:diagnostics:run") },
  settings: {
    get: () => invoke("manager:settings:get"),
    update: (settings) => invoke("manager:settings:update", settings),
    vaultAvailable: () => invoke("manager:settings:vault-available"),
    forgetSecrets: () => invoke("manager:settings:forget-secrets"),
  },
  events: {
    onProgress: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        value: OperationProgress,
      ) => listener(value);
      ipcRenderer.on("manager:progress", handler);
      return () => ipcRenderer.removeListener("manager:progress", handler);
    },
    onChanged: (listener) => {
      const handler = () => listener();
      ipcRenderer.on("manager:changed", handler);
      return () => ipcRenderer.removeListener("manager:changed", handler);
    },
  },
  updates: {
    install: () => invoke("update:install"),
    onStatus: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        value: UpdateStatus,
      ) => listener(value);
      ipcRenderer.on("update:status", handler);
      return () => ipcRenderer.removeListener("update:status", handler);
    },
  },
};

contextBridge.exposeInMainWorld("sshManager", Object.freeze(api));
