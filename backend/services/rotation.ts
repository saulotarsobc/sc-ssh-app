import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Client, SFTPWrapper } from "ssh2";
import type {
  HostInput,
  HostRecord,
  OperationProgress,
  RotationInput,
  RotationRun,
  RotationStep,
  SshKeyRecord,
} from "../../shared/contracts";
import { ConfigService } from "./config";
import { ConnectionService } from "./connection";
import { ManagerError } from "./errors";
import { fingerprintPublicKey, KeyService } from "./keys";
import type { MetadataStore } from "./storage";

const stepDefinitions: Array<[string, string]> = [
  ["preflight", "Verify local and remote access"],
  ["generate", "Generate replacement key"],
  ["install", "Install replacement key remotely"],
  ["test-new", "Authenticate with replacement key"],
  ["switch-config", "Update local SSH config"],
  ["revoke-old", "Revoke previous remote key"],
  ["archive-old", "Archive previous local key"],
];

const authorizedFingerprint = (line: string): string | undefined => {
  const parts = line.trim().split(/\s+/);
  const index = parts.findIndex((part) => /^(ssh-|ecdsa-|sk-)/.test(part));
  if (index < 0 || !parts[index + 1]) return undefined;
  try {
    return fingerprintPublicKey(`${parts[index]} ${parts[index + 1]}`);
  } catch {
    return undefined;
  }
};

const asHostInput = (host: HostRecord, key?: SshKeyRecord): HostInput => ({
  id: host.id,
  alias: host.alias,
  hostname: host.hostname,
  port: host.port,
  user: host.user,
  keyId: key?.id,
  identityFile: key?.privateKeyPath ?? host.identityFile,
  identitiesOnly: host.identitiesOnly,
  serverAliveInterval: host.serverAliveInterval,
  additionalDirectives: host.additionalDirectives,
});

export class RotationService {
  private runningHosts = new Set<string>();

  constructor(
    private readonly store: MetadataStore,
    private readonly keys: KeyService,
    private readonly config: ConfigService,
    private readonly connections: ConnectionService,
    private readonly notify: (progress: OperationProgress) => void,
  ) {}

  async list(): Promise<RotationRun[]> {
    return this.store.getRotations();
  }

  async run(input: RotationInput): Promise<RotationRun> {
    if (this.runningHosts.has(input.hostId))
      throw new ManagerError(
        "CONFLICT",
        "A rotation is already running for this host",
      );
    this.runningHosts.add(input.hostId);
    const host = (await this.config.hosts()).find(
      (item) => item.id === input.hostId,
    );
    if (!host) throw new ManagerError("NOT_FOUND", "Host was not found");
    const oldKey = (await this.keys.list()).find(
      (key) =>
        key.id === host.keyId ||
        key.privateKeyPath?.toLowerCase() === host.identityFile?.toLowerCase(),
    );
    if (!oldKey?.privateKeyPath || !oldKey.publicKey) {
      this.runningHosts.delete(input.hostId);
      throw new ManagerError(
        "CONFLICT",
        "Rotation requires an indexed private/public key pair",
      );
    }

    const run: RotationRun = {
      id: randomUUID(),
      hostId: host.id,
      hostAlias: host.alias,
      oldKeyId: oldKey.id,
      state: "running",
      startedAt: new Date().toISOString(),
      steps: stepDefinitions.map(([id, label]): RotationStep => ({
        id,
        label,
        state: "pending",
      })),
    };
    await this.store.saveRotation(run);
    await this.store.audit(
      "rotation.started",
      "success",
      host.alias,
      `Started key rotation for ${host.alias}`,
    );

    let newKey: SshKeyRecord | undefined;
    let configSwitched = false;
    let remoteInstalled = false;
    try {
      this.startStep(run, "preflight");
      const preflight = await this.connections.test(
        host,
        oldKey,
        input.credentials,
      );
      if (!preflight.success) {
        const error = new Error(preflight.message) as Error & {
          hostFingerprint?: string;
        };
        error.hostFingerprint = preflight.hostFingerprint;
        throw error;
      }
      this.completeStep(
        run,
        "preflight",
        `Connected in ${preflight.latencyMs} ms`,
      );

      this.startStep(run, "generate");
      newKey = await this.keys.create({
        ...input.newKey,
        name: `${input.newKey.name}_${Date.now()}`,
      });
      run.newKeyId = newKey.id;
      this.completeStep(run, "generate", newKey.fingerprint);

      this.startStep(run, "install");
      const oldConnection = await this.connections.connect(
        host,
        oldKey,
        input.credentials,
      );
      try {
        await this.installRemoteKey(
          oldConnection.client,
          newKey.publicKey!,
          newKey.fingerprint,
        );
      } finally {
        oldConnection.client.end();
      }
      remoteInstalled = true;
      this.completeStep(
        run,
        "install",
        "New key installed while the previous key remains valid",
      );

      this.startStep(run, "test-new");
      const newCredentials = {
        passphrase: input.newKey.passphrase,
        acceptHostFingerprint: input.credentials.acceptHostFingerprint,
      };
      const newTest = await this.connections.test(host, newKey, newCredentials);
      if (!newTest.success)
        throw new ManagerError(
          "AUTHENTICATION_FAILED",
          `Replacement key test failed: ${newTest.message}`,
        );
      this.completeStep(
        run,
        "test-new",
        `Authenticated in ${newTest.latencyMs} ms`,
      );

      this.startStep(run, "switch-config");
      await this.config.saveHost(
        asHostInput(host, newKey),
        newKey.privateKeyPath,
      );
      configSwitched = true;
      this.completeStep(
        run,
        "switch-config",
        "SSH config now references the replacement key",
      );

      if (input.revokeOldKey) {
        this.startStep(run, "revoke-old");
        const newConnection = await this.connections.connect(
          host,
          newKey,
          newCredentials,
        );
        try {
          await this.revokeRemoteKey(newConnection.client, oldKey.fingerprint);
        } finally {
          newConnection.client.end();
        }
        this.completeStep(
          run,
          "revoke-old",
          "Previous key removed from authorized_keys",
        );
      } else {
        this.skipStep(
          run,
          "revoke-old",
          "Previous remote key retained by request",
        );
      }

      this.startStep(run, "archive-old");
      await this.keys.archive(oldKey.id);
      this.completeStep(run, "archive-old", "Previous local key archived");
      run.state = "completed";
      run.completedAt = new Date().toISOString();
      await this.store.saveRotation(run);
      await this.store.audit(
        "rotation.completed",
        "success",
        host.alias,
        `Completed key rotation for ${host.alias}`,
      );
      return run;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Rotation failed";
      const current = run.steps.find((step) => step.state === "running");
      if (current) {
        current.state = "failed";
        current.message = message;
      }
      try {
        if (configSwitched)
          await this.config.saveHost(
            asHostInput(host, oldKey),
            oldKey.privateKeyPath,
          );
        if (remoteInstalled && newKey) {
          const rollbackConnection = await this.connections.connect(
            host,
            oldKey,
            input.credentials,
          );
          try {
            await this.removeRemoteKeyIfPresent(
              rollbackConnection.client,
              newKey.fingerprint,
            );
          } finally {
            rollbackConnection.client.end();
          }
        }
        if (newKey) await this.keys.archive(newKey.id);
        run.state = "rolled-back";
      } catch (rollbackError) {
        run.state = "attention-required";
        run.error = `${message}. Rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : "unknown error"}`;
      }
      run.error ??= message;
      run.completedAt = new Date().toISOString();
      await this.store.saveRotation(run);
      await this.store.audit(
        "rotation.failed",
        "failure",
        host.alias,
        run.error,
      );
      return run;
    } finally {
      this.runningHosts.delete(input.hostId);
    }
  }

  private startStep(run: RotationRun, id: string): void {
    const step = run.steps.find((item) => item.id === id)!;
    step.state = "running";
    this.notify({
      operationId: run.id,
      scope: "rotation",
      step: id,
      message: step.label,
    });
  }

  private completeStep(run: RotationRun, id: string, message: string): void {
    const step = run.steps.find((item) => item.id === id)!;
    step.state = "completed";
    step.message = message;
    step.completedAt = new Date().toISOString();
    this.notify({ operationId: run.id, scope: "rotation", step: id, message });
    void this.store.saveRotation(run);
  }

  private skipStep(run: RotationRun, id: string, message: string): void {
    const step = run.steps.find((item) => item.id === id)!;
    step.state = "skipped";
    step.message = message;
  }

  private async installRemoteKey(
    client: Client,
    publicKey: string,
    fingerprint: string,
  ): Promise<void> {
    await this.withAuthorizedKeys(
      client,
      async (content, sftp, authorizedPath) => {
        const lines = content.split(/\r?\n/).filter(Boolean);
        if (lines.some((line) => authorizedFingerprint(line) === fingerprint))
          return;
        lines.push(publicKey.trim());
        await this.writeAuthorizedKeys(
          sftp,
          authorizedPath,
          `${lines.join("\n")}\n`,
          content,
        );
      },
    );
  }

  private async revokeRemoteKey(
    client: Client,
    fingerprint: string,
  ): Promise<void> {
    await this.withAuthorizedKeys(
      client,
      async (content, sftp, authorizedPath) => {
        const lines = content.split(/\r?\n/).filter(Boolean);
        const matching = lines.filter(
          (line) => authorizedFingerprint(line) === fingerprint,
        );
        if (matching.length !== 1)
          throw new ManagerError(
            "CONFLICT",
            `Expected one matching remote key, found ${matching.length}`,
          );
        const remaining = lines.filter(
          (line) => authorizedFingerprint(line) !== fingerprint,
        );
        if (!remaining.some((line) => authorizedFingerprint(line))) {
          throw new ManagerError(
            "CONFLICT",
            "Refusing to remove the last usable key from authorized_keys",
          );
        }
        await this.writeAuthorizedKeys(
          sftp,
          authorizedPath,
          `${remaining.join("\n")}\n`,
          content,
        );
      },
    );
  }

  private async removeRemoteKeyIfPresent(
    client: Client,
    fingerprint: string,
  ): Promise<void> {
    await this.withAuthorizedKeys(
      client,
      async (content, sftp, authorizedPath) => {
        const lines = content.split(/\r?\n/).filter(Boolean);
        const remaining = lines.filter(
          (line) => authorizedFingerprint(line) !== fingerprint,
        );
        if (remaining.length !== lines.length)
          await this.writeAuthorizedKeys(
            sftp,
            authorizedPath,
            `${remaining.join("\n")}\n`,
            content,
          );
      },
    );
  }

  private async withAuthorizedKeys(
    client: Client,
    action: (
      content: string,
      sftp: SFTPWrapper,
      authorizedPath: string,
    ) => Promise<void>,
  ): Promise<void> {
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) =>
      client.sftp((error, value) => (error ? reject(error) : resolve(value))),
    );
    const home = await new Promise<string>((resolve, reject) =>
      sftp.realpath(".", (error, value) =>
        error ? reject(error) : resolve(value),
      ),
    );
    const sshDirectory = path.posix.join(home.replace(/\\/g, "/"), ".ssh");
    const authorizedPath = path.posix.join(sshDirectory, "authorized_keys");
    await this.sftpMkdir(sftp, sshDirectory);
    await this.sftpChmod(sftp, sshDirectory, 0o700);
    const content = await this.sftpRead(sftp, authorizedPath);
    await action(content, sftp, authorizedPath);
    sftp.end();
  }

  private async writeAuthorizedKeys(
    sftp: SFTPWrapper,
    authorizedPath: string,
    next: string,
    previous: string,
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (previous)
      await this.sftpWrite(
        sftp,
        `${authorizedPath}.sc-ssh-backup.${timestamp}`,
        previous,
      );
    const temporary = `${authorizedPath}.sc-ssh-${randomUUID()}.tmp`;
    await this.sftpWrite(sftp, temporary, next);
    await this.sftpChmod(sftp, temporary, 0o600);
    await new Promise<void>((resolve, reject) =>
      sftp.rename(temporary, authorizedPath, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    await this.sftpChmod(sftp, authorizedPath, 0o600);
  }

  private async sftpRead(sftp: SFTPWrapper, filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      sftp.readFile(filePath, (error, data) => {
        if (
          error &&
          (error as NodeJS.ErrnoException).code !== "ENOENT" &&
          (error as { code?: number }).code !== 2
        )
          reject(error);
        else resolve(data?.toString() ?? "");
      });
    });
  }

  private async sftpWrite(
    sftp: SFTPWrapper,
    filePath: string,
    content: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      sftp.writeFile(filePath, content, { mode: 0o600 }, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
  }

  private async sftpMkdir(sftp: SFTPWrapper, directory: string): Promise<void> {
    const exists = await new Promise<boolean>((resolve) =>
      sftp.stat(directory, (error) => resolve(!error)),
    );
    if (exists) return;
    await new Promise<void>((resolve, reject) =>
      sftp.mkdir(directory, { mode: 0o700 }, (error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
  }

  private async sftpChmod(
    sftp: SFTPWrapper,
    target: string,
    mode: number,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      sftp.chmod(target, mode, (error) => (error ? reject(error) : resolve())),
    );
  }
}
