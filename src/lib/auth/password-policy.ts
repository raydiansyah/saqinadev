/**
 * Rules for a NEW password (sign-up, reset, change). Sign-in never applies them, so accounts
 * created before the rule keep working. Shared by the forms (instant feedback) and the Better
 * Auth hook (the actual enforcement).
 */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordIssue = "tooShort" | "weak";

export function passwordIssue(password: string): PasswordIssue | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "tooShort";
  const hasNumber = /\p{N}/u.test(password);
  // A symbol is anything that is not a letter, number or whitespace.
  const hasSymbol = /[^\p{L}\p{N}\s]/u.test(password);
  return hasNumber && hasSymbol ? null : "weak";
}

/** Endpoints that set a new password, with the body field that carries it. */
export const PASSWORD_ENDPOINTS: Record<string, string> = {
  "/sign-up/email": "password",
  "/reset-password": "newPassword",
  "/change-password": "newPassword",
  "/set-password": "newPassword",
};
