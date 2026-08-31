import { describe, expect, it } from "vitest";
import { hostInputSchema, keyCreateSchema } from "../shared/schemas";

describe("IPC schemas", () => {
  it("rejects an unprotected key without explicit confirmation", () => {
    const result = keyCreateSchema.safeParse({
      name: "test",
      algorithm: "ed25519",
      comment: "",
      tags: [],
      rotationIntervalDays: 90,
      rotationReminderDays: 14,
      allowUnprotected: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects shell metacharacters in host aliases", () => {
    const result = hostInputSchema.safeParse({
      alias: "prod; rm",
      hostname: "example.com",
      port: 22,
      user: "root",
      identitiesOnly: true,
      additionalDirectives: {},
    });
    expect(result.success).toBe(false);
  });
});
