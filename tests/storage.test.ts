import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MetadataStore } from "../backend/services/storage";

describe("metadata and audit storage", () => {
  it("persists atomically and redacts common secret labels", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sc-ssh-store-"));
    try {
      const store = new MetadataStore(root, path.join(root, ".ssh"));
      await store.initialize();
      expect(store.settings.retainRemoteAuthorizedKeysBackups).toBe(true);
      await store.audit(
        "host.tested",
        "failure",
        "host",
        "password=supersecret passphrase=hunter2",
      );
      const raw = await readFile(path.join(root, "audit.jsonl"), "utf8");
      expect(raw).not.toContain("supersecret");
      expect(raw).not.toContain("hunter2");
      expect(raw).toContain("[redacted]");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
