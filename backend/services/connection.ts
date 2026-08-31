import { execFile } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ssh2, { type Client as SshClient, type ConnectConfig } from "ssh2";
import type {
  ConnectionCredentials,
  ConnectionTestResult,
  HostRecord,
  SshKeyRecord,
} from "../../shared/contracts";
import { fingerprintPublicKey, publicKeyFromBlob } from "./keys";
import type { MetadataStore } from "./storage";
import { openInTerminal } from "./terminal";

const execFileAsync = promisify(execFile);
const { Client, utils } = ssh2;

export interface ConnectedClient {
  client: SshClient;
  fingerprint: string;
}

const hostToken = (host: HostRecord): string =>
  host.port === 22 ? host.hostname : `[${host.hostname}]:${host.port}`;

const errorCategory = (message: string): ConnectionTestResult["category"] => {
  if (
    /authentication|permission denied|all configured authentication/i.test(
      message,
    )
  )
    return "authentication";
  if (/host key|fingerprint/i.test(message)) return "host-key";
  if (/timeout|refused|unreachable|ENOTFOUND|EHOSTUNREACH|ECONN/i.test(message))
    return "network";
  if (/config|private key|passphrase/i.test(message)) return "configuration";
  return "unknown";
};

export class ConnectionService {
  constructor(private readonly store: MetadataStore) {}

  async test(
    host: HostRecord,
    key: SshKeyRecord | undefined,
    credentials: ConnectionCredentials = {},
  ): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      const connected = await this.connect(host, key, credentials);
      connected.client.end();
      return {
        success: true,
        latencyMs: Date.now() - started,
        message: "Connection and authentication succeeded",
        hostFingerprint: connected.fingerprint,
      };
    } catch (error) {
      const value = error as Error & { hostFingerprint?: string };
      return {
        success: false,
        latencyMs: Date.now() - started,
        category: errorCategory(value.message),
        message: value.message,
        hostFingerprint: value.hostFingerprint,
      };
    }
  }

  async connect(
    host: HostRecord,
    key: SshKeyRecord | undefined,
    credentials: ConnectionCredentials = {},
  ): Promise<ConnectedClient> {
    const known = await this.knownFingerprints(host);
    let observedFingerprint = "";
    let acceptedPublic = "";
    let privateKey: Buffer | undefined;
    if (key?.privateKeyPath) privateKey = await readFile(key.privateKeyPath);

    return new Promise<ConnectedClient>((resolve, reject) => {
      const client = new Client();
      const timer = setTimeout(() => {
        client.destroy();
        reject(new Error(`Connection to ${host.alias} timed out`));
      }, 15_000);
      const finishReject = (error: Error) => {
        clearTimeout(timer);
        if (observedFingerprint)
          Object.assign(error, { hostFingerprint: observedFingerprint });
        reject(error);
      };
      client.once("ready", async () => {
        clearTimeout(timer);
        if (
          !known.size &&
          credentials.acceptHostFingerprint === observedFingerprint &&
          acceptedPublic
        ) {
          try {
            await this.rememberHost(host, acceptedPublic);
          } catch {
            // Trust was explicit for this connection; inability to persist is reported by diagnostics later.
          }
        }
        resolve({ client, fingerprint: observedFingerprint });
      });
      client.once("error", finishReject);
      if (credentials.password?.value) {
        client.on(
          "keyboard-interactive",
          (_name, _instructions, _language, prompts, finish) => {
            finish(prompts.map(() => credentials.password?.value ?? ""));
          },
        );
      }
      const config: ConnectConfig = {
        host: host.hostname,
        port: host.port,
        username: host.user,
        readyTimeout: 15_000,
        keepaliveInterval: 5_000,
        keepaliveCountMax: 2,
        privateKey,
        passphrase: credentials.passphrase?.value,
        password: credentials.password?.value,
        tryKeyboard: Boolean(credentials.password?.value),
        hostVerifier: (raw: Buffer) => {
          const parsed = utils.parseKey(raw);
          if (parsed instanceof Error) return false;
          acceptedPublic = publicKeyFromBlob(parsed.getPublicSSH());
          observedFingerprint = fingerprintPublicKey(acceptedPublic);
          if (known.has(observedFingerprint)) return true;
          return credentials.acceptHostFingerprint === observedFingerprint;
        },
      };
      try {
        client.connect(config);
      } catch (error) {
        finishReject(error as Error);
      }
    });
  }

  async openTerminal(host: HostRecord): Promise<void> {
    await openInTerminal(this.store.settings.terminal, "ssh", [host.alias]);
  }

  private async knownFingerprints(host: HostRecord): Promise<Set<string>> {
    const knownHosts = path.join(
      this.store.settings.sshDirectory,
      "known_hosts",
    );
    try {
      const { stdout } = await execFileAsync(
        "ssh-keygen",
        ["-F", hostToken(host), "-f", knownHosts],
        {
          windowsHide: true,
          timeout: 5_000,
        },
      );
      const fingerprints = new Set<string>();
      for (const line of stdout.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          try {
            fingerprints.add(fingerprintPublicKey(`${parts[1]} ${parts[2]}`));
          } catch {
            // Ignore malformed or certificate entries.
          }
        }
      }
      return fingerprints;
    } catch {
      return new Set();
    }
  }

  private async rememberHost(
    host: HostRecord,
    publicKey: string,
  ): Promise<void> {
    const knownHosts = path.join(
      this.store.settings.sshDirectory,
      "known_hosts",
    );
    await appendFile(knownHosts, `${hostToken(host)} ${publicKey}\n`, {
      mode: 0o600,
    });
  }
}
