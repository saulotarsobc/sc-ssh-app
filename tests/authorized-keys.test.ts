import { describe, expect, it } from "vitest";
import { fingerprintPublicKey } from "../backend/services/keys";
import { mergeAuthorizedKey } from "../backend/services/rotation";

const publicKey =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPXCOiWPhrKioXfJ1ZBoTrQvaAIvPk5pVQ1NQqXhGf/5 test";

describe("authorized_keys merge", () => {
  it("adds a missing key without replacing existing entries", () => {
    const existing = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7 old\n";
    const result = mergeAuthorizedKey(
      existing,
      publicKey,
      fingerprintPublicKey(publicKey),
    );
    expect(result.added).toBe(true);
    expect(result.content).toContain(existing.trim());
    expect(result.content).toContain(publicKey);
  });

  it("does not duplicate an already authorized key with options", () => {
    const content = `restrict ${publicKey}\n`;
    const result = mergeAuthorizedKey(
      content,
      publicKey,
      fingerprintPublicKey(publicKey),
    );
    expect(result).toEqual({ content, added: false });
  });
});
