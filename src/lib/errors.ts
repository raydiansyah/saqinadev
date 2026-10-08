/**
 * Predictable error categories. Services throw `AppError`; actions turn every error into an
 * `ActionResult` so the UI only ever sees a code, a safe message key and an error reference.
 */

export const ERROR_CODES = [
  "AUTHENTICATION_ERROR",
  "AUTHORIZATION_ERROR",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMIT",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Field name to message key, for forms. */
export type FieldErrors = Record<string, string>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields?: FieldErrors;

  constructor(code: ErrorCode, message?: string, fields?: FieldErrors) {
    super(message ?? code);
    this.name = "AppError";
    this.code = code;
    this.fields = fields;
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; ref?: string; fields?: FieldErrors };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

// No 0/O/1/I so references read unambiguously over the phone or in a screenshot.
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Short reference shown to the user and written to the log, e.g. "REQ-82K2". */
export function errorRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `REQ-${Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("")}`;
}
