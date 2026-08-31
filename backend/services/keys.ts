import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import ssh2, { type ParsedKey } from "ssh2";
import type {
  HostRecord,
  KeyAlgorithm,
  KeyCreateInput,
  KeyImportInput,
  KeyUpdateInput,
  RotationPolicy,
  SshKeyRecord,
} from "../../shared/contracts";
import { ManagerError } from "./errors";
import type { MetadataStore, StoredKeyMetadata } from "./storage";

const PRIVATE_MARKERS = ["PRIVATE KEY-----", "PuTTY-User-Key-File-"];
const { utils } = ssh2;

const algorithmOf = (type: string): KeyAlgorithm => {
  if (type.includes("ed25519-sk")) return "sk-ed25519";
  if (type.includes("ecdsa-sk")) return "sk-ecdsa";
  if (type.includes("ed25519")) return "ed25519";
  if (type.includes("rsa")) return "rsa";
  if (type.includes("ecdsa")) return "ecdsa";
  if (type.includes("dss") || type.includes("dsa")) return "dsa";
  return "unknown";
};

const publicParts = (
  value: string,
): { type: string; blob: Buffer; comment: string } => {
  const [type = "unknown", encoded = "", ...comment] = value
    .trim()
    .split(/\s+/);
  if (!encoded)
    throw new ManagerError("VALIDATION_ERROR", "Invalid SSH public key");
  return {
    type,
    blob: Buffer.from(encoded, "base64"),
    comment: comment.join(" "),
  };
};

export const fingerprintPublicKey = (value: string): string => {
  const { blob } = publicParts(value);
  return `SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/, "")}`;
};

const parse = (value: Buffer | string, passphrase?: string): ParsedKey => {
  const result = utils.parseKey(value, passphrase);
  if (result instanceof Error) throw result;
  return result;
};

export const publicKeyFromBlob = (blob: Buffer, comment = ""): string => {
  if (blob.length < 4) {
    throw new ManagerError("VALIDATION_ERROR", "Invalid SSH public key blob");
  }
  const typeLength = blob.readUInt32BE(0);
  if (typeLength < 1 || 4 + typeLength > blob.length) {
    throw new ManagerError("VALIDATION_ERROR", "Invalid SSH public key blob");
  }
  const type = blob.subarray(4, 4 + typeLength).toString("utf8");
  const base = `${type} ${blob.toString("base64")}`;
  return comment ? `${base} ${comment}` : base;
};

const normalizePublic = (value: string, fallbackComment = ""): string => {
  const parsed = parse(value);
  const comment = parsed.comment || fallbackComment;
  return publicKeyFromBlob(parsed.getPublicSSH(), comment);
};

const dueAt = (from: string, days: number): string => {
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const expandHomePath = (
  value: string | undefined,
  sshDirectory: string,
): string | undefined => {
  if (!value) return undefined;
  if (value === "~/.ssh") return sshDirectory;
  if (value.startsWith("~/.ssh/"))
    return path.join(sshDirectory, value.slice(7));
  if (value.startsWith("~/"))
    return path.join(path.dirname(sshDirectory), value.slice(2));
  return path.resolve(value);
};

export class KeyService {
  constructor(
    private readonly store: MetadataStore,
    private readonly getHosts: () => Promise<HostRecord[]>,
  ) {}

  async list(includeArchived = false): Promise<SshKeyRecord[]> {
    const active = await this.scanActive();
    const archived = includeArchived ? await this.scanArchived() : [];
    return [...active, ...archived].sort((a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );
  }

  async get(id: string, includeArchived = true): Promise<SshKeyRecord> {
    const item = (await this.list(includeArchived)).find(
      (key) => key.id === id,
    );
    if (!item) throw new ManagerError("NOT_FOUND", "SSH key was not found");
    return item;
  }

  async create(input: KeyCreateInput): Promise<SshKeyRecord> {
    const sshDirectory = this.store.settings.sshDirectory;
    await mkdir(sshDirectory, { recursive: true, mode: 0o700 });
    const prefix = input.algorithm === "rsa" ? "id_rsa" : "id_ed25519";
    const privatePath = await this.availablePath(
      path.join(sshDirectory, `${prefix}_${input.name}`),
    );
    const options = {
      ...(input.algorithm === "rsa" ? { bits: 4096 } : {}),
      comment: input.comment,
      ...(input.passphrase?.value
        ? {
            passphrase: input.passphrase.value,
            cipher: "aes256-ctr",
            rounds: 16,
          }
        : {}),
    };
    const pair = await new Promise<{ private: string; public: string }>(
      (resolve, reject) => {
        utils.generateKeyPair(
          input.algorithm,
          options as never,
          (error, keys) => {
            if (error || !keys)
              reject(error ?? new Error("Key generation returned no data"));
            else resolve(keys);
          },
        );
      },
    );
    const publicValue = normalizePublic(pair.public, input.comment);
    await writeFile(privatePath, pair.private, { mode: 0o600, flag: "wx" });
    try {
      await writeFile(`${privatePath}.pub`, `${publicValue}\n`, {
        mode: 0o644,
        flag: "wx",
      });
    } catch (error) {
      await rm(privatePath, { force: true });
      throw error;
    }

    const now = new Date().toISOString();
    const fingerprint = fingerprintPublicKey(publicValue);
    const metadata: StoredKeyMetadata = {
      id: randomUUID(),
      fingerprint,
      name: input.name,
      tags: [...new Set(input.tags)],
      managed: true,
      originalPath: privatePath,
      rotationPolicy: {
        enabled: true,
        intervalDays: input.rotationIntervalDays,
        reminderDays: input.rotationReminderDays,
        lastRotatedAt: now,
        dueAt: dueAt(now, input.rotationIntervalDays),
      },
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveKey(metadata);
    await this.store.audit(
      "key.created",
      "success",
      fingerprint,
      `Created ${input.algorithm} key ${input.name}`,
    );
    return this.get(metadata.id);
  }

  async import(input: KeyImportInput): Promise<SshKeyRecord> {
    const source = path.resolve(input.path);
    const sourceContent = await readFile(source);
    const parsed = parse(sourceContent, input.passphrase?.value);
    if (!parsed.isPrivateKey())
      throw new ManagerError(
        "VALIDATION_ERROR",
        "Select a private SSH key file",
      );
    const publicValue = normalizePublic(
      publicKeyFromBlob(parsed.getPublicSSH()),
      parsed.comment,
    );
    const fingerprint = fingerprintPublicKey(publicValue);
    const existing = (await this.list(true)).find(
      (key) => key.fingerprint === fingerprint,
    );
    if (existing)
      throw new ManagerError(
        "CONFLICT",
        `This key is already indexed as '${existing.name}'`,
      );

    const sshDirectory = this.store.settings.sshDirectory;
    await mkdir(sshDirectory, { recursive: true, mode: 0o700 });
    const insideSshDirectory =
      path.dirname(source).toLowerCase() === sshDirectory.toLowerCase();
    const target = insideSshDirectory
      ? source
      : await this.availablePath(
          path.join(sshDirectory, path.basename(source)),
        );
    if (!insideSshDirectory) await copyFile(source, target);
    if (process.platform !== "win32") await chmod(target, 0o600);
    await writeFile(`${target}.pub`, `${publicValue}\n`, { mode: 0o644 });

    const fileInfo = await stat(target);
    const createdAt = fileInfo.birthtime.toISOString();
    const metadata: StoredKeyMetadata = {
      id: randomUUID(),
      fingerprint,
      name: input.name ?? path.basename(target),
      tags: [...new Set(input.tags)],
      managed: true,
      originalPath: target,
      rotationPolicy: {
        enabled: true,
        intervalDays: input.rotationIntervalDays,
        reminderDays: input.rotationReminderDays,
        lastRotatedAt: createdAt,
        dueAt: dueAt(createdAt, input.rotationIntervalDays),
      },
      createdAt,
      updatedAt: new Date().toISOString(),
    };
    await this.store.saveKey(metadata);
    await this.store.audit(
      "key.imported",
      "success",
      fingerprint,
      `Imported key ${metadata.name}`,
    );
    return this.get(metadata.id);
  }

  async update(input: KeyUpdateInput): Promise<SshKeyRecord> {
    const current = await this.get(input.id);
    const metadata =
      this.store.findKey(input.id) ?? this.metadataFromRecord(current);
    metadata.name = input.name;
    metadata.tags = [...new Set(input.tags)];
    metadata.rotationPolicy = structuredClone(input.rotationPolicy);
    metadata.updatedAt = new Date().toISOString();
    await this.store.saveKey(metadata);
    await this.store.audit(
      "key.updated",
      "success",
      current.fingerprint,
      `Updated metadata for ${input.name}`,
    );
    return this.get(input.id);
  }

  async archive(id: string): Promise<SshKeyRecord> {
    const key = await this.get(id, false);
    if (key.hostAliases.length) {
      throw new ManagerError(
        "CONFLICT",
        `Key is referenced by: ${key.hostAliases.join(", ")}`,
      );
    }
    if (!key.privateKeyPath)
      throw new ManagerError("CONFLICT", "Public-only keys cannot be archived");
    const metadata = this.store.findKey(id) ?? this.metadataFromRecord(key);
    const targetDirectory = path.join(this.store.archiveDirectory, id);
    await mkdir(targetDirectory, { recursive: true, mode: 0o700 });
    const privateTarget = path.join(
      targetDirectory,
      path.basename(key.privateKeyPath),
    );
    await rename(key.privateKeyPath, privateTarget);
    let publicTarget: string | undefined;
    if (key.publicKeyPath && (await this.exists(key.publicKeyPath))) {
      publicTarget = `${privateTarget}.pub`;
      await rename(key.publicKeyPath, publicTarget);
    }
    metadata.originalPath = key.privateKeyPath;
    metadata.archivedPrivatePath = privateTarget;
    metadata.archivedPublicPath = publicTarget;
    metadata.updatedAt = new Date().toISOString();
    await this.store.saveKey(metadata);
    await this.store.audit(
      "key.archived",
      "success",
      key.fingerprint,
      `Archived key ${key.name}`,
    );
    return this.get(id, true);
  }

  async restore(id: string): Promise<SshKeyRecord> {
    const metadata = this.store.findKey(id);
    if (!metadata?.archivedPrivatePath)
      throw new ManagerError("NOT_FOUND", "Archived key was not found");
    const requested =
      metadata.originalPath ??
      path.join(
        this.store.settings.sshDirectory,
        path.basename(metadata.archivedPrivatePath),
      );
    const target = await this.availablePath(requested);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await rename(metadata.archivedPrivatePath, target);
    if (
      metadata.archivedPublicPath &&
      (await this.exists(metadata.archivedPublicPath))
    ) {
      await rename(metadata.archivedPublicPath, `${target}.pub`);
    }
    metadata.originalPath = target;
    metadata.archivedPrivatePath = undefined;
    metadata.archivedPublicPath = undefined;
    metadata.updatedAt = new Date().toISOString();
    await this.store.saveKey(metadata);
    await this.store.audit(
      "key.restored",
      "success",
      metadata.fingerprint,
      `Restored key ${metadata.name}`,
    );
    return this.get(id, false);
  }

  async deletePermanently(id: string): Promise<void> {
    const metadata = this.store.findKey(id);
    if (!metadata?.archivedPrivatePath)
      throw new ManagerError(
        "CONFLICT",
        "Only archived keys can be permanently deleted",
      );
    await rm(path.dirname(metadata.archivedPrivatePath), {
      recursive: true,
      force: true,
    });
    await this.store.deleteKey(id);
    await this.store.audit(
      "key.deleted",
      "success",
      metadata.fingerprint,
      `Permanently deleted ${metadata.name}`,
    );
  }

  private async scanActive(): Promise<SshKeyRecord[]> {
    const sshDirectory = this.store.settings.sshDirectory;
    await mkdir(sshDirectory, { recursive: true, mode: 0o700 });
    const names = await readdir(sshDirectory, { withFileTypes: true });
    const candidates = names.filter(
      (entry) => entry.isFile() && !entry.name.endsWith(".pub"),
    );
    const hosts = await this.getHosts();
    const records: SshKeyRecord[] = [];
    for (const candidate of candidates) {
      const privatePath = path.join(sshDirectory, candidate.name);
      let content: Buffer;
      try {
        content = await readFile(privatePath);
      } catch {
        continue;
      }
      const header = content.subarray(0, 256).toString("utf8");
      if (!PRIVATE_MARKERS.some((marker) => header.includes(marker))) continue;
      records.push(await this.recordFromFiles(privatePath, hosts));
    }

    for (const candidate of names.filter(
      (entry) => entry.isFile() && entry.name.endsWith(".pub"),
    )) {
      const privatePath = path.join(sshDirectory, candidate.name.slice(0, -4));
      if (await this.exists(privatePath)) continue;
      const publicPath = path.join(sshDirectory, candidate.name);
      try {
        records.push(await this.recordFromPublicOnly(publicPath, hosts));
      } catch {
        // Non-key .pub files are ignored.
      }
    }
    return records;
  }

  private async scanArchived(): Promise<SshKeyRecord[]> {
    const records: SshKeyRecord[] = [];
    for (const metadata of this.store.getKeyMetadata()) {
      if (
        !metadata.archivedPrivatePath ||
        !(await this.exists(metadata.archivedPrivatePath))
      )
        continue;
      const publicPath = metadata.archivedPublicPath;
      const publicValue =
        publicPath && (await this.exists(publicPath))
          ? (await readFile(publicPath, "utf8")).trim()
          : undefined;
      const parts = publicValue
        ? publicParts(publicValue)
        : { type: "unknown", comment: "", blob: Buffer.alloc(0) };
      records.push({
        id: metadata.id,
        name: metadata.name,
        fingerprint: metadata.fingerprint,
        algorithm: algorithmOf(parts.type),
        comment: parts.comment,
        privateKeyPath: metadata.archivedPrivatePath,
        publicKeyPath: publicPath,
        publicKey: publicValue,
        encrypted: await this.isEncrypted(metadata.archivedPrivatePath),
        status: "archived",
        managed: metadata.managed,
        tags: metadata.tags,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        rotationPolicy: metadata.rotationPolicy,
        hostAliases: [],
        health: "warning",
        issues: ["Archived and unavailable to SSH clients"],
      });
    }
    return records;
  }

  private async recordFromFiles(
    privatePath: string,
    hosts: HostRecord[],
  ): Promise<SshKeyRecord> {
    const publicPath = `${privatePath}.pub`;
    let publicValue: string | undefined;
    let encrypted = false;
    let parseIssue: string | undefined;
    const publicFileExists = await this.exists(publicPath);
    if (publicFileExists) {
      publicValue = (await readFile(publicPath, "utf8")).trim();
    } else {
      const privateValue = await readFile(privatePath);
      try {
        const parsed = parse(privateValue);
        publicValue = normalizePublic(
          publicKeyFromBlob(parsed.getPublicSSH()),
          parsed.comment,
        );
      } catch (error) {
        encrypted = true;
        parseIssue =
          error instanceof Error
            ? error.message
            : "Encrypted key requires a passphrase";
      }
    }
    encrypted ||= await this.isEncrypted(privatePath);
    const info = await stat(privatePath);
    const fingerprint = publicValue
      ? fingerprintPublicKey(publicValue)
      : `locked:${createHash("sha256").update(privatePath).digest("hex")}`;
    const parts = publicValue
      ? publicParts(publicValue)
      : { type: "unknown", comment: "", blob: Buffer.alloc(0) };
    const metadata = this.findMetadata(fingerprint, privatePath);
    const hostAliases = hosts
      .filter(
        (host) =>
          expandHomePath(
            host.identityFile,
            this.store.settings.sshDirectory,
          )?.toLowerCase() === privatePath.toLowerCase(),
      )
      .map((host) => host.alias);
    const createdAt = metadata?.createdAt ?? info.birthtime.toISOString();
    const rotationPolicy =
      metadata?.rotationPolicy ?? this.defaultPolicy(createdAt);
    const issues: string[] = [];
    if (!publicValue)
      issues.push(
        parseIssue ?? "Public key is missing and the private key is locked",
      );
    if (!encrypted) issues.push("Private key has no passphrase");
    if (rotationPolicy.dueAt && new Date(rotationPolicy.dueAt) <= new Date())
      issues.push("Rotation is overdue");
    if (process.platform !== "win32" && (info.mode & 0o077) !== 0)
      issues.push("Private key permissions are too broad");
    const algorithm = algorithmOf(parts.type);
    if (["dsa", "unknown"].includes(algorithm))
      issues.push("Unsupported or deprecated key algorithm");
    const id = metadata?.id ?? randomUUID();
    if (!metadata) {
      await this.store.saveKey({
        id,
        fingerprint,
        name: path.basename(privatePath),
        tags: [],
        managed: false,
        originalPath: privatePath,
        rotationPolicy,
        createdAt,
        updatedAt: info.mtime.toISOString(),
      });
    }
    return {
      id,
      name: metadata?.name ?? path.basename(privatePath),
      fingerprint,
      algorithm,
      bits: algorithm === "rsa" ? 4096 : undefined,
      comment: parts.comment,
      privateKeyPath: privatePath,
      publicKeyPath: publicFileExists ? publicPath : undefined,
      publicKey: publicValue,
      encrypted,
      status: ["dsa", "unknown", "sk-ed25519", "sk-ecdsa"].includes(algorithm)
        ? "read-only"
        : "active",
      managed: metadata?.managed ?? false,
      tags: metadata?.tags ?? [],
      createdAt,
      updatedAt: metadata?.updatedAt ?? info.mtime.toISOString(),
      rotationPolicy,
      hostAliases,
      health: issues.some(
        (issue) => issue.includes("overdue") || issue.includes("Unsupported"),
      )
        ? "critical"
        : issues.length
          ? "warning"
          : "healthy",
      issues,
    };
  }

  private async recordFromPublicOnly(
    publicPath: string,
    hosts: HostRecord[],
  ): Promise<SshKeyRecord> {
    const publicValue = (await readFile(publicPath, "utf8")).trim();
    const parts = publicParts(publicValue);
    const fingerprint = fingerprintPublicKey(publicValue);
    const info = await stat(publicPath);
    const metadata = this.findMetadata(fingerprint, publicPath);
    const id = metadata?.id ?? randomUUID();
    if (!metadata) {
      await this.store.saveKey({
        id,
        fingerprint,
        name: path.basename(publicPath),
        tags: [],
        managed: false,
        rotationPolicy: this.defaultPolicy(info.birthtime.toISOString()),
        createdAt: info.birthtime.toISOString(),
        updatedAt: info.mtime.toISOString(),
      });
    }
    return {
      id,
      name: metadata?.name ?? path.basename(publicPath),
      fingerprint,
      algorithm: algorithmOf(parts.type),
      comment: parts.comment,
      publicKeyPath: publicPath,
      publicKey: publicValue,
      encrypted: false,
      status: "read-only",
      managed: metadata?.managed ?? false,
      tags: metadata?.tags ?? [],
      createdAt: metadata?.createdAt ?? info.birthtime.toISOString(),
      updatedAt: metadata?.updatedAt ?? info.mtime.toISOString(),
      rotationPolicy:
        metadata?.rotationPolicy ??
        this.defaultPolicy(info.birthtime.toISOString()),
      hostAliases: hosts
        .filter((host) => host.identityFile === publicPath)
        .map((host) => host.alias),
      health: "warning",
      issues: ["Public key only; private material is unavailable"],
    };
  }

  private metadataFromRecord(key: SshKeyRecord): StoredKeyMetadata {
    return {
      id: key.id,
      fingerprint: key.fingerprint,
      name: key.name,
      tags: key.tags,
      managed: key.managed,
      originalPath: key.privateKeyPath,
      rotationPolicy: key.rotationPolicy,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    };
  }

  private findMetadata(
    fingerprint: string,
    filePath: string,
  ): StoredKeyMetadata | undefined {
    const metadata = this.store.getKeyMetadata();
    return (
      metadata.find((item) => item.fingerprint === fingerprint) ??
      metadata.find(
        (item) => item.originalPath?.toLowerCase() === filePath.toLowerCase(),
      )
    );
  }

  private defaultPolicy(createdAt: string): RotationPolicy {
    const { rotationIntervalDays, rotationReminderDays } = this.store.settings;
    return {
      enabled: true,
      intervalDays: rotationIntervalDays,
      reminderDays: rotationReminderDays,
      lastRotatedAt: createdAt,
      dueAt: dueAt(createdAt, rotationIntervalDays),
    };
  }

  private async availablePath(requested: string): Promise<string> {
    if (
      !(await this.exists(requested)) &&
      !(await this.exists(`${requested}.pub`))
    )
      return requested;
    for (let index = 2; index < 10_000; index += 1) {
      const candidate = `${requested}_${index}`;
      if (
        !(await this.exists(candidate)) &&
        !(await this.exists(`${candidate}.pub`))
      )
        return candidate;
    }
    throw new ManagerError(
      "CONFLICT",
      "Could not allocate a unique key filename",
    );
  }

  private async isEncrypted(privatePath: string): Promise<boolean> {
    const content = await readFile(privatePath, "utf8");
    if (content.startsWith("PuTTY-User-Key-File-"))
      return /Encryption:\s*(?!none)/i.test(content);
    if (!content.includes("OPENSSH PRIVATE KEY"))
      return content.includes("ENCRYPTED PRIVATE KEY");
    try {
      parse(content);
      return false;
    } catch {
      return true;
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
