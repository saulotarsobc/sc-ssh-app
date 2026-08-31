export type KeyAlgorithm =
  "ed25519" | "rsa" | "ecdsa" | "dsa" | "sk-ed25519" | "sk-ecdsa" | "unknown";

export type KeyStatus = "active" | "archived" | "missing" | "read-only";
export type HealthLevel = "healthy" | "warning" | "critical";

export interface RotationPolicy {
  enabled: boolean;
  intervalDays: number;
  reminderDays: number;
  lastRotatedAt?: string;
  dueAt?: string;
}

export interface SshKeyRecord {
  id: string;
  name: string;
  fingerprint: string;
  algorithm: KeyAlgorithm;
  bits?: number;
  comment: string;
  privateKeyPath?: string;
  publicKeyPath?: string;
  publicKey?: string;
  encrypted: boolean;
  status: KeyStatus;
  managed: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  rotationPolicy: RotationPolicy;
  hostAliases: string[];
  health: HealthLevel;
  issues: string[];
}

export interface HostRecord {
  id: string;
  alias: string;
  hostname: string;
  port: number;
  user: string;
  identityFile?: string;
  keyId?: string;
  identitiesOnly: boolean;
  serverAliveInterval?: number;
  additionalDirectives: Record<string, string>;
  raw: string;
  lineStart: number;
  lineEnd: number;
  simple: boolean;
  issues: string[];
}

export type RotationState =
  | "planned"
  | "running"
  | "completed"
  | "rolled-back"
  | "attention-required"
  | "failed";

export interface RotationStep {
  id: string;
  label: string;
  state: "pending" | "running" | "completed" | "failed" | "skipped";
  message?: string;
  completedAt?: string;
}

export interface RotationRun {
  id: string;
  hostId: string;
  hostAlias: string;
  oldKeyId?: string;
  newKeyId?: string;
  state: RotationState;
  startedAt: string;
  completedAt?: string;
  steps: RotationStep[];
  error?: string;
}

export type AuditOperation =
  | "key.created"
  | "key.imported"
  | "key.updated"
  | "key.archived"
  | "key.restored"
  | "key.deleted"
  | "host.created"
  | "host.updated"
  | "host.deleted"
  | "host.tested"
  | "host.key-installed"
  | "config.updated"
  | "config.organized"
  | "config.restored"
  | "rotation.started"
  | "rotation.completed"
  | "rotation.failed"
  | "agent.updated"
  | "settings.updated";

export interface AuditEntry {
  id: string;
  timestamp: string;
  operation: AuditOperation;
  outcome: "success" | "failure";
  target?: string;
  message: string;
  durationMs?: number;
}

export interface AppSettings {
  sshDirectory: string;
  theme: "dark" | "light" | "system";
  terminal: "auto" | "windows-terminal" | "terminal-app" | "x-terminal";
  launchAtLogin: boolean;
  minimizeToTray: boolean;
  rotationIntervalDays: number;
  rotationReminderDays: number;
  autoOrganizeConfig: boolean;
}

export interface SecretInput {
  value: string;
  remember: boolean;
}

export interface KeyCreateInput {
  name: string;
  algorithm: "ed25519" | "rsa";
  comment: string;
  passphrase?: SecretInput;
  tags: string[];
  rotationIntervalDays: number;
  rotationReminderDays: number;
  allowUnprotected: boolean;
}

export interface KeyImportInput {
  path: string;
  name?: string;
  passphrase?: SecretInput;
  tags: string[];
  rotationIntervalDays: number;
  rotationReminderDays: number;
}

export interface KeyUpdateInput {
  id: string;
  name: string;
  tags: string[];
  rotationPolicy: RotationPolicy;
}

export interface HostInput {
  id?: string;
  alias: string;
  hostname: string;
  port: number;
  user: string;
  keyId?: string;
  identityFile?: string;
  identitiesOnly: boolean;
  serverAliveInterval?: number;
  additionalDirectives: Record<string, string>;
}

export interface ServerSetupInput {
  alias: string;
  hostname: string;
  port: number;
  user: string;
  password: SecretInput;
  algorithm: "ed25519" | "rsa";
  comment: string;
  passphrase?: SecretInput;
  allowUnprotected: boolean;
  acceptHostFingerprint?: string;
}

export interface ServerSetupResult {
  host: HostRecord;
  key: SshKeyRecord;
  connection: ConnectionTestResult;
}

export interface ConnectionCredentials {
  passphrase?: SecretInput;
  password?: SecretInput;
  acceptHostFingerprint?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  category?:
    "authentication" | "network" | "host-key" | "configuration" | "unknown";
  message: string;
  hostFingerprint?: string;
}

export interface RotationInput {
  hostId: string;
  credentials: ConnectionCredentials;
  newKey: KeyCreateInput;
  revokeOldKey: boolean;
}

export interface ConfigPreview {
  original: string;
  proposed: string;
  changed: boolean;
  valid: boolean;
  semanticEquivalent: boolean;
  warnings: string[];
  error?: string;
}

export interface ConfigSnapshot {
  id: string;
  createdAt: string;
  reason: string;
  size: number;
  checksum: string;
}

export interface AgentIdentity {
  fingerprint: string;
  comment: string;
  algorithm?: string;
}

export interface AgentStatus {
  available: boolean;
  identities: AgentIdentity[];
  message: string;
}

export interface DiagnosticItem {
  id: string;
  title: string;
  level: HealthLevel;
  message: string;
  resolution?: string;
}

export interface DashboardSummary {
  keyCount: number;
  hostCount: number;
  dueSoonCount: number;
  criticalCount: number;
  diagnostics: DiagnosticItem[];
  recentActivity: AuditEntry[];
}

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PERMISSION_DENIED"
  | "SSH_UNAVAILABLE"
  | "AUTHENTICATION_FAILED"
  | "HOST_KEY_UNKNOWN"
  | "CONFIG_INVALID"
  | "OPERATION_FAILED";

export type OperationResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: ErrorCode; message: string; details?: string };
    };

export interface OperationProgress {
  operationId: string;
  scope: "scan" | "connection" | "rotation" | "config";
  step: string;
  message: string;
  percent?: number;
}

export type UpdateStatus =
  | { state: "available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

export interface SshManagerApi {
  dashboard: {
    summary(): Promise<OperationResult<DashboardSummary>>;
  };
  keys: {
    list(includeArchived?: boolean): Promise<OperationResult<SshKeyRecord[]>>;
    create(input: KeyCreateInput): Promise<OperationResult<SshKeyRecord>>;
    import(input: KeyImportInput): Promise<OperationResult<SshKeyRecord>>;
    update(input: KeyUpdateInput): Promise<OperationResult<SshKeyRecord>>;
    archive(id: string): Promise<OperationResult<SshKeyRecord>>;
    restore(id: string): Promise<OperationResult<SshKeyRecord>>;
    deletePermanently(id: string): Promise<OperationResult<boolean>>;
    copyPublic(id: string): Promise<OperationResult<boolean>>;
    exportPublic(id: string): Promise<OperationResult<string | null>>;
    reveal(id: string): Promise<OperationResult<boolean>>;
    pickImportFile(): Promise<string | null>;
  };
  hosts: {
    list(): Promise<OperationResult<HostRecord[]>>;
    setup(input: ServerSetupInput): Promise<OperationResult<ServerSetupResult>>;
    save(input: HostInput): Promise<OperationResult<HostRecord>>;
    remove(id: string): Promise<OperationResult<boolean>>;
    test(
      id: string,
      credentials?: ConnectionCredentials,
    ): Promise<OperationResult<ConnectionTestResult>>;
    installKey(
      id: string,
      credentials: ConnectionCredentials,
    ): Promise<OperationResult<ConnectionTestResult>>;
    openTerminal(id: string): Promise<OperationResult<boolean>>;
  };
  config: {
    read(): Promise<OperationResult<string>>;
    preview(content: string): Promise<OperationResult<ConfigPreview>>;
    previewOrganize(): Promise<OperationResult<ConfigPreview>>;
    apply(content: string, reason: string): Promise<OperationResult<boolean>>;
    organize(): Promise<OperationResult<boolean>>;
    backups(): Promise<OperationResult<ConfigSnapshot[]>>;
    restore(id: string): Promise<OperationResult<boolean>>;
  };
  rotations: {
    list(): Promise<OperationResult<RotationRun[]>>;
    run(input: RotationInput): Promise<OperationResult<RotationRun>>;
  };
  agent: {
    status(): Promise<OperationResult<AgentStatus>>;
    add(keyId: string): Promise<OperationResult<boolean>>;
    remove(fingerprint: string): Promise<OperationResult<boolean>>;
  };
  activity: {
    list(limit?: number): Promise<OperationResult<AuditEntry[]>>;
  };
  diagnostics: {
    run(): Promise<OperationResult<DiagnosticItem[]>>;
  };
  settings: {
    get(): Promise<OperationResult<AppSettings>>;
    update(settings: AppSettings): Promise<OperationResult<AppSettings>>;
    vaultAvailable(): Promise<OperationResult<boolean>>;
    forgetSecrets(): Promise<OperationResult<boolean>>;
  };
  events: {
    onProgress(listener: (progress: OperationProgress) => void): () => void;
    onChanged(listener: () => void): () => void;
  };
  updates: {
    install(): Promise<void>;
    onStatus(listener: (status: UpdateStatus) => void): () => void;
  };
}
