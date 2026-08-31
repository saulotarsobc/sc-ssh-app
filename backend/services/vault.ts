import { safeStorage } from "electron";
import { readFile, rm, writeFile } from "node:fs/promises";
import type { MetadataStore } from "./storage";

type VaultState = Record<string, string>;

export class SecretVault {
  constructor(private readonly store: MetadataStore) {}

  async available(): Promise<boolean> {
    if (!safeStorage.isEncryptionAvailable()) return false;
    return (
      process.platform !== "linux" ||
      safeStorage.getSelectedStorageBackend() !== "basic_text"
    );
  }

  async remember(key: string, secret: string): Promise<void> {
    if (!secret || !(await this.available())) return;
    const state = await this.read();
    state[key] = safeStorage.encryptString(secret).toString("base64");
    await writeFile(this.store.vaultPath, JSON.stringify(state, null, 2), {
      mode: 0o600,
    });
  }

  async recall(key: string): Promise<string | undefined> {
    if (!(await this.available())) return undefined;
    const state = await this.read();
    const encrypted = state[key];
    if (!encrypted) return undefined;
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      return undefined;
    }
  }

  async forget(key: string): Promise<void> {
    const state = await this.read();
    delete state[key];
    await writeFile(this.store.vaultPath, JSON.stringify(state, null, 2), {
      mode: 0o600,
    });
  }

  async clear(): Promise<void> {
    await rm(this.store.vaultPath, { force: true });
  }

  private async read(): Promise<VaultState> {
    try {
      return JSON.parse(
        await readFile(this.store.vaultPath, "utf8"),
      ) as VaultState;
    } catch {
      return {};
    }
  }
}
