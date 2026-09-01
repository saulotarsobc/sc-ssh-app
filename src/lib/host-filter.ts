import type { HostRecord } from "../../shared/contracts";

const normalize = (value: string): string =>
  value.normalize("NFKD").trim().toLocaleLowerCase();

export function filterHosts(hosts: HostRecord[], search: string): HostRecord[] {
  const query = normalize(search);
  if (!query) return hosts;
  return hosts.filter((host) =>
    normalize(
      [
        host.alias,
        host.hostname,
        host.user,
        host.identityFile ?? "",
        host.key?.fingerprint ?? "",
        ...host.issues,
      ].join(" "),
    ).includes(query),
  );
}
