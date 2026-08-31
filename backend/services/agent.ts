import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AgentIdentity,
  AgentStatus,
  SshKeyRecord,
} from "../../shared/contracts";
import { ManagerError } from "./errors";
import type { MetadataStore } from "./storage";
import { openInTerminal } from "./terminal";

const execFileAsync = promisify(execFile);

export class AgentService {
  constructor(
    private readonly store: MetadataStore,
    private readonly getKeys: () => Promise<SshKeyRecord[]>,
  ) {}

  async status(): Promise<AgentStatus> {
    try {
      const { stdout } = await execFileAsync("ssh-add", ["-l"], {
        windowsHide: true,
        timeout: 5_000,
      });
      const identities = stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line): AgentIdentity => {
          const match = /^\d+\s+(SHA256:\S+)\s+(.+?)(?:\s+\(([^)]+)\))?$/.exec(
            line.trim(),
          );
          return {
            fingerprint: match?.[1] ?? line,
            comment: match?.[2] ?? "Unknown identity",
            algorithm: match?.[3],
          };
        });
      return {
        available: true,
        identities,
        message: `${identities.length} identities loaded`,
      };
    } catch (error) {
      const value = error as Error & {
        code?: number | string;
        stderr?: string;
      };
      if (value.code === 1)
        return {
          available: true,
          identities: [],
          message: "The SSH agent has no identities",
        };
      return {
        available: false,
        identities: [],
        message: value.stderr || value.message || "SSH agent is unavailable",
      };
    }
  }

  async add(key: SshKeyRecord): Promise<void> {
    if (!key.privateKeyPath)
      throw new ManagerError("NOT_FOUND", "Private key file is unavailable");
    if (key.encrypted) {
      await openInTerminal(this.store.settings.terminal, "ssh-add", [
        key.privateKeyPath,
      ]);
    } else {
      await execFileAsync("ssh-add", [key.privateKeyPath], {
        windowsHide: true,
        timeout: 10_000,
      });
    }
    await this.store.audit(
      "agent.updated",
      "success",
      key.fingerprint,
      `Added ${key.name} to SSH agent`,
    );
  }

  async remove(fingerprint: string): Promise<void> {
    const key = (await this.getKeys()).find(
      (item) => item.fingerprint === fingerprint,
    );
    if (!key?.publicKeyPath)
      throw new ManagerError(
        "NOT_FOUND",
        "The identity is not backed by an indexed public key",
      );
    await execFileAsync("ssh-add", ["-d", key.publicKeyPath], {
      windowsHide: true,
      timeout: 10_000,
    });
    await this.store.audit(
      "agent.updated",
      "success",
      fingerprint,
      `Removed ${key.name} from SSH agent`,
    );
  }
}
