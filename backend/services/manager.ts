import { watch, type FSWatcher } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AppSettings,
  ConnectionCredentials,
  DashboardSummary,
  HostInput,
  HostRecord,
  KeyCreateInput,
  KeyImportInput,
  KeyUpdateInput,
  OperationProgress,
  RotationInput,
  ServerSetupInput,
  ServerSetupResult,
  SshKeyRecord,
} from "../../shared/contracts";
import { AgentService } from "./agent";
import { ConfigService } from "./config";
import { ConnectionService } from "./connection";
import { DiagnosticService } from "./diagnostics";
import { ManagerError } from "./errors";
import { KeyService } from "./keys";
import { RotationService } from "./rotation";
import { MetadataStore } from "./storage";
import { SecretVault } from "./vault";

export class SshManager {
  readonly store: MetadataStore;
  readonly config: ConfigService;
  readonly keys: KeyService;
  readonly connections: ConnectionService;
  readonly rotations: RotationService;
  readonly agent: AgentService;
  readonly diagnostics: DiagnosticService;
  readonly vault: SecretVault;
  private watcher?: FSWatcher;
  private changeTimer?: NodeJS.Timeout;

  constructor(
    dataDirectory: string,
    onProgress: (progress: OperationProgress) => void,
    private readonly onChanged: () => void,
  ) {
    this.store = new MetadataStore(
      dataDirectory,
      path.join(os.homedir(), ".ssh"),
    );
    this.config = new ConfigService(this.store);
    this.keys = new KeyService(this.store, () => this.config.hosts());
    this.connections = new ConnectionService(this.store);
    this.rotations = new RotationService(
      this.store,
      this.keys,
      this.config,
      this.connections,
      onProgress,
    );
    this.agent = new AgentService(this.store, () => this.keys.list(true));
    this.diagnostics = new DiagnosticService(this.store);
    this.vault = new SecretVault(this.store);
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
    this.startWatcher();
  }

  dispose(): void {
    this.watcher?.close();
    if (this.changeTimer) clearTimeout(this.changeTimer);
  }

  async dashboardSummary(): Promise<DashboardSummary> {
    const [keys, hosts, recentActivity] = await Promise.all([
      this.keys.list(),
      this.hosts(),
      this.store.readAudit(8),
    ]);
    const diagnostics = await this.diagnostics.run(keys, hosts);
    const reminderThreshold =
      Date.now() + this.store.settings.rotationReminderDays * 86_400_000;
    return {
      keyCount: keys.length,
      hostCount: hosts.length,
      dueSoonCount: keys.filter(
        (key) =>
          key.rotationPolicy.enabled &&
          key.rotationPolicy.dueAt &&
          new Date(key.rotationPolicy.dueAt).getTime() <= reminderThreshold,
      ).length,
      criticalCount: diagnostics.filter((item) => item.level === "critical")
        .length,
      diagnostics,
      recentActivity,
    };
  }

  async hosts(): Promise<HostRecord[]> {
    const [hosts, keys] = await Promise.all([
      this.config.hosts(),
      this.keys.list(false),
    ]);
    return hosts.map((host) => {
      const identity = this.expandIdentity(host.identityFile);
      const key = keys.find(
        (candidate) =>
          candidate.privateKeyPath?.toLowerCase() === identity?.toLowerCase(),
      );
      return {
        ...host,
        keyId: key?.id,
        key: key
          ? {
              id: key.id,
              fingerprint: key.fingerprint,
              algorithm: key.algorithm,
              encrypted: key.encrypted,
              health: key.health,
              rotationPolicy: key.rotationPolicy,
              issues: key.issues,
            }
          : undefined,
      };
    });
  }

  async saveHost(input: HostInput): Promise<HostRecord> {
    const key = input.keyId
      ? await this.keys.get(input.keyId, false)
      : undefined;
    const saved = await this.config.saveHost(
      input,
      key?.privateKeyPath ?? input.identityFile,
    );
    await this.store.audit(
      input.id ? "host.updated" : "host.created",
      "success",
      saved.alias,
      `${input.id ? "Updated" : "Created"} host ${saved.alias}`,
    );
    this.onChanged();
    return { ...saved, keyId: key?.id };
  }

  async setupHost(input: ServerSetupInput): Promise<ServerSetupResult> {
    const duplicate = (await this.config.hosts()).some(
      (host) => host.alias.toLowerCase() === input.alias.toLowerCase(),
    );
    if (duplicate)
      throw new Error(`Host alias '${input.alias}' already exists`);

    const provisionalHost: HostRecord = {
      id: input.alias.toLowerCase(),
      alias: input.alias,
      hostname: input.hostname,
      port: input.port,
      user: input.user,
      identitiesOnly: true,
      serverAliveInterval: 60,
      additionalDirectives: {},
      raw: "",
      lineStart: 0,
      lineEnd: 0,
      simple: true,
      issues: [],
    };
    const preflight = await this.connections.test(provisionalHost, undefined, {
      password: { value: input.password.value, remember: false },
      acceptHostFingerprint: input.acceptHostFingerprint,
    });
    if (!preflight.success) {
      if (preflight.category === "host-key" && preflight.hostFingerprint) {
        throw new ManagerError(
          "HOST_KEY_UNKNOWN",
          "Verify the server host key before continuing",
          preflight.hostFingerprint,
        );
      }
      throw new ManagerError(
        "AUTHENTICATION_FAILED",
        `Server login failed: ${preflight.message}`,
      );
    }

    let key: SshKeyRecord | undefined;
    let configSaved = false;
    try {
      key = await this.keys.create({
        name: input.alias,
        algorithm: input.algorithm,
        comment: input.comment || `${input.user}@${input.hostname}`,
        passphrase: input.passphrase,
        tags: [input.alias],
        rotationIntervalDays: this.store.settings.rotationIntervalDays,
        rotationReminderDays: this.store.settings.rotationReminderDays,
        allowUnprotected: input.allowUnprotected,
      });
      const saved = await this.config.saveHost(
        {
          alias: input.alias,
          hostname: input.hostname,
          port: input.port,
          user: input.user,
          keyId: key.id,
          identitiesOnly: true,
          serverAliveInterval: 60,
          additionalDirectives: {},
        },
        key.privateKeyPath,
      );
      configSaved = true;
      const host = { ...saved, keyId: key.id };
      const connection = await this.rotations.installExistingKey(host, key, {
        password: { value: input.password.value, remember: false },
        passphrase: input.passphrase,
        acceptHostFingerprint: input.acceptHostFingerprint,
      });
      this.onChanged();
      return { host, key, connection };
    } catch (error) {
      if (configSaved) await this.config.removeHost(input.alias);
      if (key) {
        await this.keys.archive(key.id);
        await this.keys.deletePermanently(key.id);
      }
      this.onChanged();
      throw error;
    }
  }

  async removeHost(id: string): Promise<void> {
    const host = (await this.hosts()).find((item) => item.id === id);
    if (!host) throw new ManagerError("NOT_FOUND", "Host was not found");
    const key = host.keyId ? await this.keys.get(host.keyId, false) : undefined;
    const keyIsDedicated =
      key?.hostAliases.every(
        (alias) => alias.toLowerCase() === host.alias.toLowerCase(),
      ) ?? false;

    await this.config.removeHost(id);
    try {
      if (key && keyIsDedicated) await this.keys.archive(key.id);
    } catch (error) {
      await this.config.saveHost(
        {
          id: undefined,
          alias: host.alias,
          hostname: host.hostname,
          port: host.port,
          user: host.user,
          identityFile: host.identityFile,
          identitiesOnly: host.identitiesOnly,
          serverAliveInterval: host.serverAliveInterval,
          additionalDirectives: host.additionalDirectives,
        },
        host.identityFile,
      );
      throw error;
    }
    await this.store.audit(
      "host.deleted",
      "success",
      id,
      key && keyIsDedicated
        ? `Removed host ${host.alias} and archived its dedicated key`
        : `Removed host ${host.alias}`,
    );
    this.onChanged();
  }

  async testHost(id: string, credentials: ConnectionCredentials = {}) {
    const host = (await this.hosts()).find((item) => item.id === id);
    if (!host) throw new Error("Host not found");
    const key = host.keyId ? await this.keys.get(host.keyId, false) : undefined;
    const resolved = await this.resolveCredentials(host, key, credentials);
    resolved.password = undefined;
    const result = await this.connections.test(host, key, resolved);
    if (result.success) {
      if (key && credentials.passphrase?.remember)
        await this.vault.remember(
          `key:${key.id}`,
          credentials.passphrase.value,
        );
      await this.store.audit(
        "host.tested",
        "success",
        host.alias,
        `Connected in ${result.latencyMs} ms`,
      );
    } else {
      await this.store.audit(
        "host.tested",
        "failure",
        host.alias,
        result.message,
      );
    }
    return result;
  }

  async installHostKey(id: string, credentials: ConnectionCredentials) {
    const host = (await this.hosts()).find((item) => item.id === id);
    if (!host) throw new Error("Host not found");
    const key = host.keyId ? await this.keys.get(host.keyId, false) : undefined;
    if (!key?.publicKey || !key.privateKeyPath)
      throw new Error("Host does not reference a usable SSH key pair");
    const result = await this.rotations.installExistingKey(
      host,
      key,
      credentials,
    );
    if (!host.identitiesOnly) {
      await this.config.saveHost(
        {
          id: host.id,
          alias: host.alias,
          hostname: host.hostname,
          port: host.port,
          user: host.user,
          keyId: key.id,
          identitiesOnly: true,
          serverAliveInterval: host.serverAliveInterval,
          additionalDirectives: host.additionalDirectives,
        },
        key.privateKeyPath,
      );
    }
    this.onChanged();
    return result;
  }

  async createKey(input: KeyCreateInput): Promise<SshKeyRecord> {
    const key = await this.keys.create(input);
    if (input.passphrase?.remember)
      await this.vault.remember(`key:${key.id}`, input.passphrase.value);
    this.onChanged();
    return key;
  }

  async importKey(input: KeyImportInput): Promise<SshKeyRecord> {
    const key = await this.keys.import(input);
    if (input.passphrase?.remember)
      await this.vault.remember(`key:${key.id}`, input.passphrase.value);
    this.onChanged();
    return key;
  }

  async updateKey(input: KeyUpdateInput): Promise<SshKeyRecord> {
    const key = await this.keys.update(input);
    this.onChanged();
    return key;
  }

  async runRotation(input: RotationInput) {
    const host = (await this.hosts()).find((item) => item.id === input.hostId);
    const currentKey = host?.keyId
      ? await this.keys.get(host.keyId, false)
      : undefined;
    const credentials = host
      ? await this.resolveCredentials(host, currentKey, input.credentials)
      : input.credentials;
    const run = await this.rotations.run({ ...input, credentials });
    if (run.state === "completed") {
      const newKey = run.newKeyId
        ? await this.keys.get(run.newKeyId, false)
        : undefined;
      if (newKey && input.newKey.passphrase?.remember) {
        await this.vault.remember(
          `key:${newKey.id}`,
          input.newKey.passphrase.value,
        );
      }
      if (currentKey) await this.vault.forget(`key:${currentKey.id}`);
    }
    this.onChanged();
    return run;
  }

  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    const previousDirectory = this.store.settings.sshDirectory;
    const saved = await this.store.updateSettings(settings);
    await this.store.audit(
      "settings.updated",
      "success",
      "application",
      "Updated application settings",
    );
    if (saved.sshDirectory !== previousDirectory) this.startWatcher();
    this.onChanged();
    return saved;
  }

  private async resolveCredentials(
    host: HostRecord,
    key: SshKeyRecord | undefined,
    credentials: ConnectionCredentials,
  ): Promise<ConnectionCredentials> {
    return {
      ...credentials,
      passphrase:
        credentials.passphrase?.value || !key
          ? credentials.passphrase
          : {
              value: (await this.vault.recall(`key:${key.id}`)) ?? "",
              remember: true,
            },
      password: credentials.password?.value
        ? credentials.password
        : {
            value: (await this.vault.recall(`host:${host.id}`)) ?? "",
            remember: true,
          },
    };
  }

  private expandIdentity(value: string | undefined): string | undefined {
    if (!value) return undefined;
    if (value.startsWith("~/.ssh/"))
      return path.join(this.store.settings.sshDirectory, value.slice(7));
    if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
    return path.resolve(value);
  }

  private startWatcher(): void {
    this.watcher?.close();
    try {
      this.watcher = watch(this.store.settings.sshDirectory, () => {
        if (this.changeTimer) clearTimeout(this.changeTimer);
        this.changeTimer = setTimeout(() => this.onChanged(), 300);
      });
    } catch {
      this.watcher = undefined;
    }
  }
}
