import type { ErrorCode, OperationResult } from "../../shared/contracts";

export class ManagerError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "ManagerError";
  }
}

const redact = (value: string): string =>
  value
    .replace(/(password|passphrase)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      "[private key redacted]",
    );

export function toFailure(error: unknown): OperationResult<never> {
  if (error instanceof ManagerError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: redact(error.message),
        details: error.details ? redact(error.details) : undefined,
      },
    };
  }

  const message =
    error instanceof Error ? error.message : "Unexpected operation failure";
  return {
    ok: false,
    error: { code: "OPERATION_FAILED", message: redact(message) },
  };
}

export const success = <T>(data: T): OperationResult<T> => ({ ok: true, data });
