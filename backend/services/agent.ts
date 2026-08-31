import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type {
  AgentIdentity,
  AgentStatus,
  SshKeyRecord,
} from "../../shared/contracts";
import { ManagerError } from "./errors";
import type { MetadataStore } from "./storage";

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
      this.openInteractive(["ssh-add", key.privateKeyPath]);
      return;
    }
    await execFileAsync("ssh-add", [key.privateKeyPath], {
      windowsHide: true,
      timeout: 10_000,
    });
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

  private openInteractive(args: string[]): void {
    let command: string;
    let commandArgs: string[];
    if (process.platform === "win32") {
      command =
        this.store.settings.terminal === "windows-terminal" ||
        this.store.settings.terminal === "auto"
          ? "wt.exe"
          : "powershell.exe";
      commandArgs =
        command === "wt.exe" ? args : ["-NoExit", "-Command", ...args];
    } else if (process.platform === "darwin") {
      command = "osascript";
      const escaped = args
        .map((value) => `'${value.replace(/'/g, "'\\''")}'`)
        .join(" ");
      commandArgs = [
        "-e",
        `tell application "Terminal" to do script "${escaped}"`,
        "-e",
        'tell application "Terminal" to activate',
      ];
    } else {
      command = "x-terminal-emulator";
      commandArgs = ["-e", ...args];
    }
    const child = spawn(command, commandArgs, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  }
}
