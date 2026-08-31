import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AppSettings,
  AuditEntry,
  AuditOperation,
  RotationPolicy,
  RotationRun,
} from "../../shared/contracts";

export interface StoredKeyMetadata {
  id: string;
  fingerprint: string;
  name: string;
  tags: string[];
  managed: boolean;
  originalPath?: string;
  archivedPrivatePath?: string;
  archivedPublicPath?: string;
  rotationPolicy: RotationPolicy;
  createdAt: string;
  updatedAt: string;
}

interface StoreState {
  version: 1;
  keys: Record<string, StoredKeyMetadata>;
  rotations: RotationRun[];
  settings: AppSettings;
}

const defaultSettings = (sshDirectory: string): AppSettings => ({
  sshDirectory,
  theme: "dark",
  terminal: "auto",
  launchAtLogin: false,
  minimizeToTray: false,
  rotationIntervalDays: 90,
  rotationReminderDays: 14,
  autoOrganizeConfig: true,
});

export class MetadataStore {
  private state: StoreState;
  private writeChain = Promise.resolve();

  constructor(
    private readonly dataDirectory: string,
    defaultSshDirectory: string,
  ) {
    this.state = {
      version: 1,
      keys: {},
      rotations: [],
      settings: defaultSettings(defaultSshDirectory),
    };
  }

  get archiveDirectory(): string {
    return path.join(this.dataDirectory, "archive");
  }

  get backupDirectory(): string {
    return path.join(this.dataDirectory, "backups");
  }

  get vaultPath(): string {
    return path.join(this.dataDirectory, "vault.json");
  }

  async initialize(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    await mkdir(this.archiveDirectory, { recursive: true, mode: 0o700 });
    await mkdir(this.backupDirectory, { recursive: true, mode: 0o700 });

    try {
      const parsed = JSON.parse(
        await readFile(path.join(this.dataDirectory, "metadata.json"), "utf8"),
      ) as Partial<StoreState>;
      this.state = {
        version: 1,
        keys: parsed.keys ?? {},
        rotations: parsed.rotations ?? [],
        settings: { ...this.state.settings, ...parsed.settings },
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && error instanceof SyntaxError) {
        await this.audit(
          "settings.updated",
          "failure",
          "metadata",
          "Corrupt metadata was ignored",
        );
      }
      await this.persist();
    }
  }

  get settings(): AppSettings {
    return structuredClone(this.state.settings);
  }

  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    this.state.settings = structuredClone(settings);
    await this.persist();
    return this.settings;
  }

  getKeyMetadata(): StoredKeyMetadata[] {
    return Object.values(this.state.keys).map((item) => structuredClone(item));
  }

  findKey(id: string): StoredKeyMetadata | undefined {
    const value = this.state.keys[id];
    return value ? structuredClone(value) : undefined;
  }

  async saveKey(value: StoredKeyMetadata): Promise<void> {
    this.state.keys[value.id] = structuredClone(value);
    await this.persist();
  }

  async deleteKey(id: string): Promise<void> {
    delete this.state.keys[id];
    await this.persist();
  }

  getRotations(): RotationRun[] {
    return structuredClone(this.state.rotations);
  }

  async saveRotation(run: RotationRun): Promise<void> {
    const index = this.state.rotations.findIndex((item) => item.id === run.id);
    if (index >= 0) this.state.rotations[index] = structuredClone(run);
    else this.state.rotations.unshift(structuredClone(run));
    this.state.rotations = this.state.rotations.slice(0, 500);
    await this.persist();
  }

  async audit(
    operation: AuditOperation,
    outcome: AuditEntry["outcome"],
    target: string | undefined,
    message: string,
    durationMs?: number,
  ): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      operation,
      outcome,
      target,
      message: message.replace(/(password|passphrase)=\S+/gi, "$1=[redacted]"),
      durationMs,
    };
    await writeFile(
      path.join(this.dataDirectory, "audit.jsonl"),
      `${JSON.stringify(entry)}\n`,
      { flag: "a", mode: 0o600 },
    );
    return entry;
  }

  async readAudit(limit = 100): Promise<AuditEntry[]> {
    try {
      const content = await readFile(
        path.join(this.dataDirectory, "audit.jsonl"),
        "utf8",
      );
      return content
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-Math.max(1, Math.min(limit, 1000)))
        .reverse()
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as AuditEntry];
          } catch {
            return [];
          }
        });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async persist(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      const target = path.join(this.dataDirectory, "metadata.json");
      const temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(this.state, null, 2), {
        mode: 0o600,
      });
      await rename(temporary, target);
    });
    await this.writeChain;
  }
}
