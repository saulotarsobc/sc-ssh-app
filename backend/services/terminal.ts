import { spawn } from "node:child_process";
import type { AppSettings } from "../../shared/contracts";

export interface TerminalLaunch {
  command: string;
  args: string[];
}

const powershellQuote = (value: string): string =>
  `'${value.replace(/'/g, "''")}'`;

export function resolveTerminalLaunch(
  platform: NodeJS.Platform,
  terminal: AppSettings["terminal"],
  command: string,
  args: string[],
): TerminalLaunch {
  const commandLine = [command, ...args];
  if (platform === "win32") {
    if (terminal === "auto" || terminal === "windows-terminal") {
      return {
        command: "wt.exe",
        args: ["new-tab", "--", ...commandLine],
      };
    }
    return {
      command: "powershell.exe",
      args: [
        "-NoExit",
        "-Command",
        `& ${commandLine.map(powershellQuote).join(" ")}`,
      ],
    };
  }
  if (platform === "darwin") {
    const shellCommand = commandLine
      .map((value) => `'${value.replace(/'/g, "'\\''")}'`)
      .join(" ")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
    return {
      command: "osascript",
      args: [
        "-e",
        `tell application "Terminal" to do script "${shellCommand}"`,
        "-e",
        'tell application "Terminal" to activate',
      ],
    };
  }
  return {
    command: "x-terminal-emulator",
    args: ["-e", ...commandLine],
  };
}

const spawnVisible = ({ command, args }: TerminalLaunch): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });

export async function openInTerminal(
  terminal: AppSettings["terminal"],
  command: string,
  args: string[],
): Promise<void> {
  try {
    await spawnVisible(
      resolveTerminalLaunch(process.platform, terminal, command, args),
    );
  } catch (error) {
    if (process.platform !== "win32" || terminal !== "auto") throw error;
    await spawnVisible(
      resolveTerminalLaunch("win32", "terminal-app", command, args),
    );
  }
}
