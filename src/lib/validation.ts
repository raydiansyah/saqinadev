import type * as z from "zod";
import { AppError, type FieldErrors } from "./errors";

/**
 * PostgreSQL cannot store a NUL character in text: it fails the whole query with an error the user
 * would see as a crash. No honest input contains one, so it is dropped before validation.
 */
export function stripNul(value: unknown): unknown {
  if (typeof value === "string")
    return value.includes("\u0000") ? value.replaceAll("\u0000", "") : value;
  if (Array.isArray(value)) return value.map(stripNul);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripNul(v)]));
  return value;
}

/** Validates untrusted input. Failures become VALIDATION_ERROR with per-field issue codes. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(stripNul(input));
  if (result.success) return result.data;
  const fields: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".") || "_";
    fields[path] ??=
      issue.code === "too_small" ? "tooShort" : issue.code === "too_big" ? "tooLong" : "invalid";
  }
  throw new AppError("VALIDATION_ERROR", "Invalid input", fields);
}
