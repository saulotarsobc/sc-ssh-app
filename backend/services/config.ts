import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  ConfigPreview,
  ConfigSnapshot,
  HostInput,
  HostRecord,
} from "../../shared/contracts";
import { ManagerError } from "./errors";
import type { MetadataStore } from "./storage";

const execFileAsync = promisify(execFile);
const SIMPLE_HOST = /^[a-zA-Z0-9._-]+$/;

export interface ConfigUnit {
  kind: "preamble" | "host" | "match";
  lines: string[];
  aliases: string[];
  simple: boolean;
  lineStart: number;
  lineEnd: number;
}

const directive = (line: string): [string, string] | undefined => {
  const withoutComment = line.replace(/\s+#.*$/, "").trim();
  if (!withoutComment || withoutComment.startsWith("#")) return undefined;
  const match = /^([^\s=]+)\s*(?:=|\s)\s*(.*)$/.exec(withoutComment);
  return match ? [match[1].toLowerCase(), match[2].trim()] : undefined;
};

export function parseConfigDocument(content: string): ConfigUnit[] {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const rawLines = content.length ? content.split(/\r?\n/) : [];
  if (rawLines[rawLines.length - 1] === "") rawLines.pop();

  const starts: number[] = [];
  rawLines.forEach((line, index) => {
    const parsed = directive(line);
    if (parsed && (parsed[0] === "host" || parsed[0] === "match"))
      starts.push(index);
  });

  const units: ConfigUnit[] = [];
  const firstStart = starts[0] ?? rawLines.length;
  if (firstStart > 0 || starts.length === 0) {
    units.push({
      kind: "preamble",
      lines: rawLines.slice(0, firstStart),
      aliases: [],
      simple: false,
      lineStart: 1,
      lineEnd: Math.max(1, firstStart),
    });
  }

  starts.forEach((start, index) => {
    const end = starts[index + 1] ?? rawLines.length;
    const lines = rawLines.slice(start, end);
    const header = directive(lines[0]);
    const kind = header?.[0] === "match" ? "match" : "host";
    const aliases =
      kind === "host" ? (header?.[1].split(/\s+/).filter(Boolean) ?? []) : [];
    const hasBarrierDirective = lines.some((line) => {
      const parsed = directive(line);
      return parsed?.[0] === "include";
    });
    units.push({
      kind,
      lines,
      aliases,
      simple:
        kind === "host" &&
        aliases.length === 1 &&
        SIMPLE_HOST.test(aliases[0]) &&
        !hasBarrierDirective,
      lineStart: start + 1,
      lineEnd: end,
    });
  });

  Object.defineProperty(units, "newline", {
    value: newline,
    enumerable: false,
  });
  return units;
}

export function serializeConfigDocument(
  units: ConfigUnit[],
  original = "",
): string {
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const joined = units.flatMap((unit) => unit.lines).join(newline);
  return joined ? `${joined}${newline}` : "";
}

export function organizeConfigContent(content: string): string {
  const units = parseConfigDocument(content).map((unit) => ({
    ...unit,
    lines: [...unit.lines],
  }));
  let cursor = 0;
  while (cursor < units.length) {
    if (!units[cursor].simple) {
      cursor += 1;
      continue;
    }
    let end = cursor;
    while (end < units.length && units[end].simple) end += 1;
    const sorted = units
      .slice(cursor, end)
      .sort((a, b) =>
        a.aliases[0].localeCompare(b.aliases[0], "en", { sensitivity: "base" }),
      );
    units.splice(cursor, sorted.length, ...sorted);
    cursor = end;
  }
  return serializeConfigDocument(units, content);
}

export function configToHosts(content: string): HostRecord[] {
  const seen = new Set<string>();
  return parseConfigDocument(content)
    .filter((unit) => unit.kind === "host")
    .map((unit) => {
      const values = new Map<string, string>();
      const additionalDirectives: Record<string, string> = {};
      for (const line of unit.lines.slice(1)) {
        const parsed = directive(line);
        if (!parsed) continue;
        const [key, value] = parsed;
        if (!values.has(key)) values.set(key, value);
        if (
          ![
            "hostname",
            "port",
            "user",
            "identityfile",
            "identitiesonly",
            "serveraliveinterval",
          ].includes(key)
        ) {
          additionalDirectives[key] = value;
        }
      }
      const alias = unit.aliases.join(" ");
      const issues: string[] = [];
      for (const item of unit.aliases) {
        const normalized = item.toLowerCase();
        if (seen.has(normalized)) issues.push(`Duplicate alias: ${item}`);
        seen.add(normalized);
      }
      if (!unit.simple)
        issues.push("Complex block: edit with care in the raw editor");
      return {
        id: alias.toLowerCase(),
        alias,
        hostname: values.get("hostname") ?? (unit.aliases[0] || ""),
        port: Number(values.get("port") ?? 22),
        user: values.get("user") ?? os.userInfo().username,
        identityFile: values.get("identityfile"),
        identitiesOnly: values.get("identitiesonly")?.toLowerCase() === "yes",
        serverAliveInterval: values.has("serveraliveinterval")
          ? Number(values.get("serveraliveinterval"))
          : undefined,
        additionalDirectives,
        raw: unit.lines.join("\n"),
        lineStart: unit.lineStart,
        lineEnd: unit.lineEnd,
        simple: unit.simple,
        issues,
      } satisfies HostRecord;
    });
}

const formatHost = (input: HostInput, identityFile?: string): string[] => {
  const lines = [
    `Host ${input.alias}`,
    `    HostName ${input.hostname}`,
    `    User ${input.user}`,
    `    Port ${input.port}`,
  ];
  if (identityFile) lines.push(`    IdentityFile ${identityFile}`);
  lines.push(`    IdentitiesOnly ${input.identitiesOnly ? "yes" : "no"}`);
  if (input.serverAliveInterval)
    lines.push(`    ServerAliveInterval ${input.serverAliveInterval}`);
  for (const [key, value] of Object.entries(input.additionalDirectives)) {
    if (key.trim() && value.trim())
      lines.push(`    ${key.trim()} ${value.trim()}`);
  }
  lines.push("");
  return lines;
};

export class ConfigService {
  constructor(private readonly store: MetadataStore) {}

  get configPath(): string {
    return path.join(this.store.settings.sshDirectory, "config");
  }

  async read(): Promise<string> {
    try {
      return await readFile(this.configPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  }

  async hosts(): Promise<HostRecord[]> {
    return configToHosts(await this.read());
  }

  async saveHost(input: HostInput, identityFile?: string): Promise<HostRecord> {
    const content = await this.read();
    const units = parseConfigDocument(content).map((unit) => ({
      ...unit,
      lines: [...unit.lines],
    }));
    const existingIndex = units.findIndex(
      (unit) =>
        unit.simple &&
        unit.aliases[0].toLowerCase() ===
          (input.id ?? input.alias).toLowerCase(),
    );
    const duplicate = units.find(
      (unit, index) =>
        index !== existingIndex &&
        unit.aliases.some(
          (alias) => alias.toLowerCase() === input.alias.toLowerCase(),
        ),
    );
    if (duplicate)
      throw new ManagerError(
        "CONFLICT",
        `Host alias '${input.alias}' already exists`,
      );
    if (input.id && existingIndex < 0)
      throw new ManagerError(
        "NOT_FOUND",
        "Host no longer exists in SSH config",
      );

    const newUnit: ConfigUnit = {
      kind: "host",
      lines: formatHost(input, identityFile ?? input.identityFile),
      aliases: [input.alias],
      simple: true,
      lineStart: 0,
      lineEnd: 0,
    };
    if (existingIndex >= 0) units.splice(existingIndex, 1, newUnit);
    else units.push(newUnit);
    const proposed = this.store.settings.autoOrganizeConfig
      ? organizeConfigContent(serializeConfigDocument(units, content))
      : serializeConfigDocument(units, content);
    await this.apply(
      proposed,
      `${input.id ? "Update" : "Add"} host ${input.alias}`,
    );
    const saved = (await this.hosts()).find(
      (host) => host.alias === input.alias,
    );
    if (!saved)
      throw new ManagerError(
        "OPERATION_FAILED",
        "Host was written but could not be reloaded",
      );
    return saved;
  }

  async removeHost(id: string): Promise<void> {
    const content = await this.read();
    const units = parseConfigDocument(content);
    const index = units.findIndex(
      (unit) =>
        unit.simple && unit.aliases[0].toLowerCase() === id.toLowerCase(),
    );
    if (index < 0)
      throw new ManagerError(
        "NOT_FOUND",
        "Only simple host blocks can be removed from the guided editor",
      );
    units.splice(index, 1);
    await this.apply(
      serializeConfigDocument(units, content),
      `Remove host ${id}`,
    );
  }

  async preview(
    proposed: string,
    requireEquivalent = false,
  ): Promise<ConfigPreview> {
    const original = await this.read();
    const parsed = parseConfigDocument(proposed);
    const aliases = [
      ...new Set(
        parsed.filter((unit) => unit.simple).map((unit) => unit.aliases[0]),
      ),
    ];
    const aliasesToValidate = aliases.length
      ? aliases
      : ["sc-ssh-validation.invalid"];
    const warnings: string[] = [];
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "sc-ssh-"));
    const originalPath = path.join(temporaryDirectory, "original-config");
    const proposedPath = path.join(temporaryDirectory, "proposed-config");
    await writeFile(originalPath, original, "utf8");
    await writeFile(proposedPath, proposed, "utf8");
    try {
      for (const alias of aliasesToValidate) {
        const next = await this.resolve(alias, proposedPath);
        if (!next.ok) {
          return {
            original,
            proposed,
            changed: original !== proposed,
            valid: false,
            semanticEquivalent: false,
            warnings,
            error: next.error,
          };
        }
      }
      let equivalent = true;
      if (requireEquivalent) {
        equivalent = true;
        for (const alias of aliases) {
          const current = await this.resolve(alias, originalPath);
          const next = await this.resolve(alias, proposedPath);
          if (!current.ok || !next.ok || current.output !== next.output) {
            equivalent = false;
            break;
          }
        }
        if (!equivalent)
          warnings.push(
            "The proposed order changes effective SSH configuration",
          );
      }
      return {
        original,
        proposed,
        changed: original !== proposed,
        valid: true,
        semanticEquivalent: equivalent,
        warnings,
      };
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async previewOrganize(): Promise<ConfigPreview> {
    const original = await this.read();
    return this.preview(organizeConfigContent(original), true);
  }

  async organize(): Promise<void> {
    const preview = await this.previewOrganize();
    if (!preview.valid || !preview.semanticEquivalent) {
      throw new ManagerError(
        "CONFIG_INVALID",
        preview.error ??
          "Organization would change effective SSH configuration",
      );
    }
    if (preview.changed)
      await this.apply(
        preview.proposed,
        "Organize SSH config alphabetically",
        false,
      );
  }

  async apply(content: string, reason: string, validate = true): Promise<void> {
    if (validate) {
      const preview = await this.preview(content);
      if (!preview.valid)
        throw new ManagerError(
          "CONFIG_INVALID",
          preview.error ?? "SSH config is invalid",
        );
    }
    await mkdir(path.dirname(this.configPath), {
      recursive: true,
      mode: 0o700,
    });
    await this.createBackup(reason);
    const temporary = `${this.configPath}.${process.pid}.tmp`;
    await writeFile(temporary, content, { mode: 0o600 });
    await rename(temporary, this.configPath);
  }

  async backups(): Promise<ConfigSnapshot[]> {
    const directory = this.store.backupDirectory;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const files = (await readdir(directory)).filter((file) =>
      file.endsWith(".json"),
    );
    const records = await Promise.all(
      files.map(
        async (file) =>
          JSON.parse(
            await readFile(path.join(directory, file), "utf8"),
          ) as ConfigSnapshot,
      ),
    );
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async restoreBackup(id: string): Promise<void> {
    const metadataPath = path.join(this.store.backupDirectory, `${id}.json`);
    const contentPath = path.join(this.store.backupDirectory, `${id}.config`);
    const metadata = JSON.parse(
      await readFile(metadataPath, "utf8"),
    ) as ConfigSnapshot;
    const content = await readFile(contentPath, "utf8");
    const checksum = createHash("sha256").update(content).digest("hex");
    if (checksum !== metadata.checksum)
      throw new ManagerError(
        "CONFIG_INVALID",
        "Backup checksum verification failed",
      );
    await this.apply(content, `Restore backup ${id}`);
  }

  private async createBackup(
    reason: string,
  ): Promise<ConfigSnapshot | undefined> {
    const current = await this.read();
    if (!current && !(await this.exists(this.configPath))) return undefined;
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const record: ConfigSnapshot = {
      id,
      createdAt: new Date().toISOString(),
      reason,
      size: Buffer.byteLength(current),
      checksum: createHash("sha256").update(current).digest("hex"),
    };
    await mkdir(this.store.backupDirectory, { recursive: true, mode: 0o700 });
    await writeFile(
      path.join(this.store.backupDirectory, `${id}.config`),
      current,
      { mode: 0o600 },
    );
    await writeFile(
      path.join(this.store.backupDirectory, `${id}.json`),
      JSON.stringify(record, null, 2),
      { mode: 0o600 },
    );
    return record;
  }

  private async resolve(
    alias: string,
    configPath: string,
  ): Promise<{ ok: true; output: string } | { ok: false; error: string }> {
    try {
      const { stdout } = await execFileAsync(
        "ssh",
        ["-G", "-F", configPath, alias],
        {
          windowsHide: true,
          timeout: 10_000,
          maxBuffer: 2 * 1024 * 1024,
        },
      );
      const output = stdout
        .split(/\r?\n/)
        .filter((line) => !line.startsWith("canonicalizehostname "))
        .join("\n");
      return { ok: true, output };
    } catch (error) {
      const value = error as Error & { stderr?: string; code?: string };
      return {
        ok: false,
        error:
          value.code === "ENOENT"
            ? "OpenSSH client is not installed"
            : value.stderr || value.message,
      };
    }
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
