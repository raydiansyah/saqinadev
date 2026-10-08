import type * as z from "zod";
import { AppError, type FieldErrors } from "./errors";

/** Validates untrusted input. Failures become VALIDATION_ERROR with per-field issue codes. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".") || "_";
    fields[path] ??=
      issue.code === "too_small" ? "tooShort" : issue.code === "too_big" ? "tooLong" : "invalid";
  }
  throw new AppError("VALIDATION_ERROR", "Invalid input", fields);
}
