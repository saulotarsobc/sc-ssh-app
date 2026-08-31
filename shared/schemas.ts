import { z } from "zod";

const requiredSecretSchema = z.object({
  value: z.string().max(4096),
  remember: z.boolean(),
});
const secretSchema = requiredSecretSchema.optional();

export const keyCreateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/),
    algorithm: z.enum(["ed25519", "rsa"]),
    comment: z.string().trim().max(254),
    passphrase: secretSchema,
    tags: z.array(z.string().trim().min(1).max(32)).max(20),
    rotationIntervalDays: z.number().int().min(1).max(3650),
    rotationReminderDays: z.number().int().min(0).max(365),
    allowUnprotected: z.boolean(),
  })
  .refine((value) => value.passphrase?.value || value.allowUnprotected, {
    message: "Confirm creation of an unprotected private key",
  });

export const keyImportSchema = z.object({
  path: z.string().min(1).max(4096),
  name: z.string().trim().min(1).max(64).optional(),
  passphrase: secretSchema,
  tags: z.array(z.string().trim().min(1).max(32)).max(20),
  rotationIntervalDays: z.number().int().min(1).max(3650),
  rotationReminderDays: z.number().int().min(0).max(365),
});

export const keyUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(64),
  tags: z.array(z.string().trim().min(1).max(32)).max(20),
  rotationPolicy: z.object({
    enabled: z.boolean(),
    intervalDays: z.number().int().min(1).max(3650),
    reminderDays: z.number().int().min(0).max(365),
    lastRotatedAt: z.string().datetime().optional(),
    dueAt: z.string().datetime().optional(),
  }),
});

export const hostInputSchema = z.object({
  id: z.string().optional(),
  alias: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/),
  hostname: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9:._-]+$/),
  port: z.number().int().min(1).max(65535),
  user: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[^\s@]+$/),
  keyId: z.string().optional(),
  identityFile: z.string().max(4096).optional(),
  identitiesOnly: z.boolean(),
  serverAliveInterval: z.number().int().min(0).max(86400).optional(),
  additionalDirectives: z.record(z.string(), z.string().max(4096)),
});

export const serverSetupSchema = z
  .object({
    alias: z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/),
    hostname: z
      .string()
      .regex(/^[a-zA-Z0-9:._-]+$/)
      .max(253),
    port: z.number().int().min(1).max(65535),
    user: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[^\s@]+$/),
    password: requiredSecretSchema.extend({
      value: z.string().min(1).max(4096),
    }),
    algorithm: z.enum(["ed25519", "rsa"]),
    comment: z.string().max(254),
    passphrase: secretSchema,
    allowUnprotected: z.boolean(),
    acceptHostFingerprint: z.string().max(256).optional(),
  })
  .refine((value) => value.passphrase?.value || value.allowUnprotected, {
    message: "Confirm creation of an unprotected private key",
  });

export const connectionCredentialsSchema = z
  .object({
    passphrase: secretSchema,
    password: secretSchema,
    acceptHostFingerprint: z.string().max(256).optional(),
  })
  .optional();

export const rotationInputSchema = z.object({
  hostId: z.string().min(1),
  credentials: connectionCredentialsSchema.unwrap(),
  newKey: keyCreateSchema,
  revokeOldKey: z.boolean(),
});

export const appSettingsSchema = z.object({
  sshDirectory: z.string().min(1).max(4096),
  theme: z.enum(["dark", "light", "system"]),
  terminal: z.enum(["auto", "windows-terminal", "terminal-app", "x-terminal"]),
  launchAtLogin: z.boolean(),
  minimizeToTray: z.boolean(),
  rotationIntervalDays: z.number().int().min(1).max(3650),
  rotationReminderDays: z.number().int().min(0).max(365),
  autoOrganizeConfig: z.boolean(),
});
