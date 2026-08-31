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
  SshKeyRecord,
} from "../../shared/contracts";
import { AgentService } from "./agent";
import { ConfigService } from "./config";
import { ConnectionService } from "./connection";
import { DiagnosticService } from "./diagnostics";
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
      return { ...host, keyId: key?.id };
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

  async removeHost(id: string): Promise<void> {
    await this.config.removeHost(id);
    await this.store.audit("host.deleted", "success", id, `Removed host ${id}`);
    this.onChanged();
  }

  async testHost(id: string, credentials: ConnectionCredentials = {}) {
    const host = (await this.hosts()).find((item) => item.id === id);
    if (!host) throw new Error("Host not found");
    const key = host.keyId ? await this.keys.get(host.keyId, false) : undefined;
    const resolved = await this.resolveCredentials(host, key, credentials);
    const result = await this.connections.test(host, key, resolved);
    if (result.success) {
      await this.rememberCredentials(host, key, credentials);
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

  private async rememberCredentials(
    host: HostRecord,
    key: SshKeyRecord | undefined,
    credentials: ConnectionCredentials,
  ): Promise<void> {
    if (credentials.password?.remember)
      await this.vault.remember(`host:${host.id}`, credentials.password.value);
    if (key && credentials.passphrase?.remember)
      await this.vault.remember(`key:${key.id}`, credentials.passphrase.value);
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
