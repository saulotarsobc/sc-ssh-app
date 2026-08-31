import { describe, expect, it } from "vitest";
import { resolveTerminalLaunch } from "../backend/services/terminal";

describe("terminal launcher", () => {
  it("opens SSH in a visible Windows Terminal tab", () => {
    expect(
      resolveTerminalLaunch("win32", "auto", "ssh", ["production"]),
    ).toEqual({
      command: "wt.exe",
      args: ["new-tab", "--", "ssh", "production"],
    });
  });

  it("quotes paths passed to the PowerShell fallback", () => {
    expect(
      resolveTerminalLaunch("win32", "terminal-app", "ssh-add", [
        "C:\\Users\\Jane Doe\\.ssh\\id_ed25519",
      ]),
    ).toEqual({
      command: "powershell.exe",
      args: [
        "-NoExit",
        "-Command",
        "& 'ssh-add' 'C:\\Users\\Jane Doe\\.ssh\\id_ed25519'",
      ],
    });
  });
});
