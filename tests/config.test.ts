import { describe, expect, it } from "vitest";
import {
  configToHosts,
  organizeConfigContent,
  parseConfigDocument,
  serializeConfigDocument,
} from "../backend/services/config";

describe("SSH config document", () => {
  it("round-trips comments, whitespace, unknown directives, and line endings", () => {
    const source =
      "# global\r\nHost zebra\r\n    HostName z.example\r\n    ProxyJump bastion\r\n\r\nHost alpha\r\n    HostName a.example\r\n";
    expect(serializeConfigDocument(parseConfigDocument(source), source)).toBe(
      source,
    );
  });

  it("sorts only consecutive simple literal hosts", () => {
    const source = [
      "Host zebra",
      "    HostName z.example",
      "",
      "Host alpha",
      "    HostName a.example",
      "",
      "Host *",
      "    ServerAliveInterval 60",
      "",
      "Host delta",
      "    HostName d.example",
      "",
      "Host beta",
      "    HostName b.example",
      "",
    ].join("\n");
    const organized = organizeConfigContent(source);
    expect(organized.indexOf("Host alpha")).toBeLessThan(
      organized.indexOf("Host zebra"),
    );
    expect(organized.indexOf("Host *")).toBeLessThan(
      organized.indexOf("Host beta"),
    );
    expect(organized.indexOf("Host beta")).toBeLessThan(
      organized.indexOf("Host delta"),
    );
  });

  it("treats Include, wildcards, multiple aliases, negation, and Match as barriers", () => {
    const source = [
      "Include config.d/*",
      "Host zed other",
      "    User one",
      "Host *.example !blocked.example",
      "    User two",
      "Match host alpha",
      "    User three",
      "Host alpha",
      "    HostName alpha.example",
      "",
    ].join("\n");
    const units = parseConfigDocument(source);
    expect(
      units
        .filter((unit) => unit.kind !== "preamble")
        .map((unit) => unit.simple),
    ).toEqual([false, false, false, true]);
    expect(organizeConfigContent(source)).toBe(source);
  });

  it("parses guided host fields while preserving advanced directives", () => {
    const [host] = configToHosts(
      "Host production\n    HostName 10.0.0.1\n    User deploy\n    Port 2222\n    IdentityFile ~/.ssh/id_ed25519_production\n    IdentitiesOnly yes\n    ServerAliveInterval 30\n    ForwardAgent no\n",
    );
    expect(host).toMatchObject({
      alias: "production",
      hostname: "10.0.0.1",
      user: "deploy",
      port: 2222,
      identitiesOnly: true,
      serverAliveInterval: 30,
    });
    expect(host.additionalDirectives).toEqual({ forwardagent: "no" });
  });
});
