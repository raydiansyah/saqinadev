import "server-only";
import { AppError } from "@/lib/errors";
import { withSecret } from "@/lib/secrets/service";

/** A provider that needs no stored key: the CLI's own login on the server does the work. */
export const usesNoKey = (adapter: string) => adapter === "local_cli";

/**
 * Opens a provider's key for one call. A local CLI has none, so the callback gets an empty string
 * and the adapter ignores it. Every other provider must have a credential.
 */
export function withProviderSecret<T>(
  provider: { adapter: string; credentialId: string | null; ownerUserId?: string | null },
  use: (secret: string) => Promise<T> | T,
): Promise<T> {
  if (usesNoKey(provider.adapter)) return Promise.resolve(use(""));
  if (!provider.credentialId) throw new AppError("NOT_FOUND", "Credential missing");
  return withSecret(
    provider.credentialId,
    { kind: "ai_provider", userId: provider.ownerUserId },
    async (secret) => use(secret),
  );
}
