import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KeyService, fingerprintPublicKey } from "../backend/services/keys";
import type { StoredKeyMetadata } from "../backend/services/storage";
import { MetadataStore } from "../backend/services/storage";

const temporary: string[] = [];
afterEach(async () =>
  Promise.all(
    temporary
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  ),
);

async function harness() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sc-ssh-test-"));
  temporary.push(root);
  const sshDirectory = path.join(root, ".ssh");
  const store = new MetadataStore(path.join(root, "data"), sshDirectory);
  await store.initialize();
  const service = new KeyService(store, async () => []);
  return { root, sshDirectory, store, service };
}

describe("key service", () => {
  it("generates a protected ED25519 pair without exposing private material", async () => {
    const { service } = await harness();
    const key = await service.create({
      name: "production",
      algorithm: "ed25519",
      comment: "test@example.com",
      passphrase: { value: "correct horse battery staple", remember: false },
      tags: ["prod"],
      rotationIntervalDays: 90,
      rotationReminderDays: 14,
      allowUnprotected: false,
    });
    expect(key.algorithm).toBe("ed25519");
    expect(key.encrypted).toBe(true);
    expect(key.publicKey).toMatch(/^ssh-ed25519 /);
    expect(key).not.toHaveProperty("privateKey");
    expect(await readFile(key.privateKeyPath!, "utf8")).toContain(
      "OPENSSH PRIVATE KEY",
    );
    expect(fingerprintPublicKey(key.publicKey!)).toBe(key.fingerprint);
  });

  it("archives and restores only unreferenced private keys", async () => {
    const { service } = await harness();
    const key = await service.create({
      name: "temporary",
      algorithm: "ed25519",
      comment: "",
      tags: [],
      rotationIntervalDays: 90,
      rotationReminderDays: 14,
      allowUnprotected: true,
    });
    const archived = await service.archive(key.id);
    expect(archived.status).toBe("archived");
    const restored = await service.restore(key.id);
    expect(restored.status).toBe("active");
    expect(restored.privateKeyPath).toBeTruthy();
  });

  it("replaces stale metadata when a path is reused for a newly created key", async () => {
    const { service, sshDirectory, store } = await harness();
    const reusedPath = path.join(sshDirectory, "id_ed25519_reused");
    const stale: StoredKeyMetadata = {
      id: "stale-record",
      fingerprint: "SHA256:stale",
      name: "old key",
      tags: [],
      managed: false,
      originalPath: reusedPath,
      rotationPolicy: {
        enabled: true,
        intervalDays: 90,
        reminderDays: 14,
      },
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    await store.saveKey(stale);

    const created = await service.create({
      name: "reused",
      algorithm: "ed25519",
      comment: "",
      tags: [],
      rotationIntervalDays: 90,
      rotationReminderDays: 14,
      allowUnprotected: true,
    });

    expect(created.name).toBe("reused");
    expect(created.id).not.toBe(stale.id);
    expect(store.getKeyMetadata()).toHaveLength(1);
    expect(store.findKey(stale.id)).toBeUndefined();
  });
});
