/** Maps a Better Auth client error (or a thrown fetch error) to a message key under auth.errors. */
export type AuthErrorKey =
  | "invalidCredentials"
  | "emailNotVerified"
  | "userExists"
  | "passwordTooShort"
  | "rateLimited"
  | "captcha"
  | "network"
  | "unknown";

export function authErrorKey(
  error: { code?: string; status?: number } | null | undefined,
): AuthErrorKey {
  if (!error) return "unknown";
  if (error.status === 429) return "rateLimited";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "invalidCredentials";
    case "EMAIL_NOT_VERIFIED":
      return "emailNotVerified";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "userExists";
    case "PASSWORD_TOO_SHORT":
      return "passwordTooShort";
    case "VERIFICATION_FAILED":
    case "MISSING_RESPONSE":
      return "captcha";
  }
  // status 0 / undefined means the request never reached the server.
  return !error.status ? "network" : "unknown";
}

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
