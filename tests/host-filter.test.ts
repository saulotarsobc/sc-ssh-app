import { describe, expect, it } from "vitest";
import type { HostRecord } from "../shared/contracts";
import { filterHosts } from "../src/lib/host-filter";

const host = (alias: string, hostname: string, user = "root"): HostRecord => ({
  id: alias,
  alias,
  hostname,
  port: 22,
  user,
  identitiesOnly: true,
  additionalDirectives: {},
  raw: "",
  lineStart: 0,
  lineEnd: 0,
  simple: true,
  issues: [],
});

describe("host filtering", () => {
  const hosts = [
    host("actions", "164.163.30.160"),
    host("appprod", "172.20.0.201", "appprod"),
    host("saulo", "164.163.30.135"),
  ];

  it("returns only the matching alias", () => {
    expect(filterHosts(hosts, "saulo").map((item) => item.alias)).toEqual([
      "saulo",
    ]);
  });

  it("matches address and user without case sensitivity", () => {
    expect(filterHosts(hosts, "172.20.0.201")[0]?.alias).toBe("appprod");
    expect(filterHosts(hosts, "APPProd")[0]?.alias).toBe("appprod");
  });
});
