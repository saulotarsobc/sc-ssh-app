import {
  app,
  clipboard,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { writeFile } from "node:fs/promises";
import { ZodError, type ZodType } from "zod";
import type { OperationResult } from "../../../shared/contracts";
import {
  appSettingsSchema,
  connectionCredentialsSchema,
  hostInputSchema,
  keyCreateSchema,
  keyImportSchema,
  keyUpdateSchema,
  rotationInputSchema,
  serverSetupSchema,
} from "../../../shared/schemas";
import { ManagerError, success, toFailure } from "../../services/errors";
import type { SshManager } from "../../services/manager";

const ensureTrustedSender = (event: IpcMainInvokeEvent): void => {
  const url = event.senderFrame?.url ?? "";
  const trusted =
    event.senderFrame === event.sender.mainFrame &&
    (url.startsWith("file://") ||
      url.startsWith("http://localhost:") ||
      url.startsWith("http://127.0.0.1:"));
  if (!trusted)
    throw new ManagerError("PERMISSION_DENIED", "Untrusted IPC sender");
};

const validate = <T>(schema: ZodType<T>, value: unknown): T => {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ManagerError(
        "VALIDATION_ERROR",
        error.issues.map((issue) => issue.message).join("; "),
      );
    }
    throw error;
  }
};

const handle = <TArgs extends unknown[], TResult>(
  channel: string,
  action: (...args: TArgs) => Promise<TResult> | TResult,
): void => {
  ipcMain.handle(
    channel,
    async (event, ...args: TArgs): Promise<OperationResult<TResult>> => {
      try {
        ensureTrustedSender(event);
        return success(await action(...args));
      } catch (error) {
        return toFailure(error);
      }
    },
  );
};

export function registerIpcHandlers(manager: SshManager): void {
  handle("manager:dashboard:summary", () => manager.dashboardSummary());

  handle("manager:keys:list", (includeArchived?: boolean) =>
    manager.keys.list(Boolean(includeArchived)),
  );
  handle("manager:keys:create", (input: unknown) =>
    manager.createKey(validate(keyCreateSchema, input)),
  );
  handle("manager:keys:import", (input: unknown) =>
    manager.importKey(validate(keyImportSchema, input)),
  );
  handle("manager:keys:update", (input: unknown) =>
    manager.updateKey(validate(keyUpdateSchema, input)),
  );
  handle("manager:keys:archive", (id: string) => manager.keys.archive(id));
  handle("manager:keys:restore", (id: string) => manager.keys.restore(id));
  handle("manager:keys:delete", async (id: string) => {
    await manager.keys.deletePermanently(id);
    return true;
  });
  handle("manager:keys:copy-public", async (id: string) => {
    const key = await manager.keys.get(id, true);
    if (!key.publicKey)
      throw new ManagerError("NOT_FOUND", "Public key content is unavailable");
    clipboard.writeText(key.publicKey);
    return true;
  });
  handle("manager:keys:export-public", async (id: string) => {
    const key = await manager.keys.get(id, true);
    if (!key.publicKey)
      throw new ManagerError("NOT_FOUND", "Public key content is unavailable");
    const selection = await dialog.showSaveDialog({
      title: "Export public key",
      defaultPath: `${key.name}.pub`,
      filters: [{ name: "SSH public key", extensions: ["pub"] }],
    });
    if (selection.canceled || !selection.filePath) return null;
    await writeFile(selection.filePath, `${key.publicKey}\n`, {
      flag: "wx",
      mode: 0o644,
    });
    return selection.filePath;
  });
  handle("manager:keys:reveal", async (id: string) => {
    const key = await manager.keys.get(id, true);
    const target = key.privateKeyPath ?? key.publicKeyPath;
    if (!target) throw new ManagerError("NOT_FOUND", "Key file is unavailable");
    shell.showItemInFolder(target);
    return true;
  });
  handle("manager:keys:pick-import", async () => {
    const selection = await dialog.showOpenDialog({
      title: "Import SSH private key",
      properties: ["openFile"],
    });
    return selection.canceled ? null : (selection.filePaths[0] ?? null);
  });

  handle("manager:hosts:list", () => manager.hosts());
  handle("manager:hosts:setup", (input: unknown) =>
    manager.setupHost(validate(serverSetupSchema, input)),
  );
  handle("manager:hosts:save", (input: unknown) =>
    manager.saveHost(validate(hostInputSchema, input)),
  );
  handle("manager:hosts:remove", async (id: string) => {
    await manager.removeHost(id);
    return true;
  });
  handle("manager:hosts:test", (id: string, credentials?: unknown) =>
    manager.testHost(
      id,
      validate(connectionCredentialsSchema, credentials) ?? {},
    ),
  );
  handle("manager:hosts:install-key", (id: string, credentials: unknown) =>
    manager.installHostKey(
      id,
      validate(connectionCredentialsSchema, credentials) ?? {},
    ),
  );
  handle("manager:hosts:open-terminal", async (id: string) => {
    const host = (await manager.hosts()).find((item) => item.id === id);
    if (!host) throw new ManagerError("NOT_FOUND", "Host was not found");
    await manager.connections.openTerminal(host);
    return true;
  });

  handle("manager:config:read", () => manager.config.read());
  handle("manager:config:preview", (content: string) =>
    manager.config.preview(String(content)),
  );
  handle("manager:config:preview-organize", () =>
    manager.config.previewOrganize(),
  );
  handle("manager:config:apply", async (content: string, reason: string) => {
    await manager.config.apply(String(content), String(reason).slice(0, 200));
    await manager.store.audit(
      "config.updated",
      "success",
      "config",
      String(reason).slice(0, 200),
    );
    return true;
  });
  handle("manager:config:organize", async () => {
    await manager.config.organize();
    await manager.store.audit(
      "config.organized",
      "success",
      "config",
      "Organized SSH config alphabetically",
    );
    return true;
  });
  handle("manager:config:backups", () => manager.config.backups());
  handle("manager:config:restore", async (id: string) => {
    await manager.config.restoreBackup(id);
    await manager.store.audit(
      "config.restored",
      "success",
      "config",
      `Restored backup ${id}`,
    );
    return true;
  });

  handle("manager:rotations:list", () => manager.rotations.list());
  handle("manager:rotations:run", (input: unknown) =>
    manager.runRotation(validate(rotationInputSchema, input)),
  );

  handle("manager:agent:status", () => manager.agent.status());
  handle("manager:agent:add", async (keyId: string) => {
    await manager.agent.add(await manager.keys.get(keyId, false));
    return true;
  });
  handle("manager:agent:remove", async (fingerprint: string) => {
    await manager.agent.remove(fingerprint);
    return true;
  });

  handle("manager:activity:list", (limit?: number) =>
    manager.store.readAudit(limit),
  );
  handle("manager:diagnostics:run", async () =>
    manager.diagnostics.run(await manager.keys.list(), await manager.hosts()),
  );
  handle("manager:settings:get", () => manager.store.settings);
  handle("manager:settings:update", async (input: unknown) => {
    const settings = validate(appSettingsSchema, input);
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
    return manager.updateSettings(settings);
  });
  handle("manager:settings:vault-available", () => manager.vault.available());
  handle("manager:settings:forget-secrets", async () => {
    await manager.vault.clear();
    return true;
  });
}
