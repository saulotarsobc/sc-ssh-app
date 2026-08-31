import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  DiagnosticItem,
  HostRecord,
  SshKeyRecord,
} from "../../shared/contracts";
import type { MetadataStore } from "./storage";

const execFileAsync = promisify(execFile);

export class DiagnosticService {
  constructor(private readonly store: MetadataStore) {}

  async run(
    keys: SshKeyRecord[],
    hosts: HostRecord[],
  ): Promise<DiagnosticItem[]> {
    const items: DiagnosticItem[] = [];
    try {
      await execFileAsync("ssh", ["-V"], { windowsHide: true, timeout: 5_000 });
      items.push({
        id: "openssh",
        title: "OpenSSH client",
        level: "healthy",
        message: "OpenSSH is available",
      });
    } catch {
      items.push({
        id: "openssh",
        title: "OpenSSH client",
        level: "critical",
        message: "OpenSSH could not be executed",
        resolution: "Install or enable the OpenSSH client and restart the app.",
      });
    }

    try {
      await access(this.store.settings.sshDirectory);
      const info = await stat(this.store.settings.sshDirectory);
      const tooBroad =
        process.platform !== "win32" && (info.mode & 0o077) !== 0;
      items.push({
        id: "ssh-directory",
        title: "SSH directory",
        level: tooBroad ? "warning" : "healthy",
        message: tooBroad
          ? "Directory permissions are broader than 0700"
          : this.store.settings.sshDirectory,
        resolution: tooBroad
          ? `Run chmod 700 '${this.store.settings.sshDirectory}'`
          : undefined,
      });
    } catch {
      items.push({
        id: "ssh-directory",
        title: "SSH directory",
        level: "warning",
        message: "Directory does not exist yet",
      });
    }

    const criticalKeys = keys.filter((key) => key.health === "critical");
    items.push({
      id: "key-health",
      title: "Key health",
      level: criticalKeys.length
        ? "critical"
        : keys.some((key) => key.health === "warning")
          ? "warning"
          : "healthy",
      message: criticalKeys.length
        ? `${criticalKeys.length} keys need immediate attention`
        : `${keys.length} keys indexed`,
    });

    const duplicateAliases = hosts.filter((host) =>
      host.issues.some((issue) => issue.startsWith("Duplicate")),
    );
    items.push({
      id: "config-health",
      title: "SSH config",
      level: duplicateAliases.length ? "critical" : "healthy",
      message: duplicateAliases.length
        ? `${duplicateAliases.length} duplicate host blocks detected`
        : `${hosts.length} host blocks parsed`,
    });

    const missingIdentities = hosts.filter(
      (host) =>
        host.identityFile &&
        !keys.some(
          (key) =>
            key.privateKeyPath &&
            path.resolve(key.privateKeyPath) ===
              path.resolve(host.identityFile!),
        ),
    );
    if (missingIdentities.length) {
      items.push({
        id: "missing-identities",
        title: "Missing identities",
        level: "warning",
        message: `${missingIdentities.length} hosts reference keys that were not indexed`,
      });
    }
    return items;
  }
}
