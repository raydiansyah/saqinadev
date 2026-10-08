import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { credentials } from "@/lib/db/schema";
import type { CredentialKind, CredentialScope } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { CryptoUnavailableError, open, seal } from "./crypto";

/** What the rest of the app may know about a secret. Never the value. */
export interface CredentialStatus {
  id: string;
  label: string;
  kind: CredentialKind;
  scope: CredentialScope;
  connected: boolean;
  lastTestedAt: Date | null;
  lastTestCode: string | null;
}

export async function storeCredential(
  executor: Executor,
  input: {
    scope: CredentialScope;
    kind: CredentialKind;
    label: string;
    secret: string;
    projectId?: string | null;
    userId?: string | null;
    createdBy: string;
  },
): Promise<string> {
  let sealed: ReturnType<typeof seal>;
  try {
    sealed = seal(input.secret);
  } catch (error) {
    if (error instanceof CryptoUnavailableError)
      throw new AppError("VALIDATION_ERROR", "Encryption key not configured", {
        secret: "encryptionUnavailable",
      });
    throw error;
  }
  const [row] = await executor
    .insert(credentials)
    .values({
      scope: input.scope,
      kind: input.kind,
      label: input.label.slice(0, 80),
      projectId: input.projectId ?? null,
      userId: input.userId ?? null,
      createdBy: input.createdBy,
      ...sealed,
    })
    .returning({ id: credentials.id });
  return row.id;
}

export async function revokeCredential(executor: Executor, id: string): Promise<void> {
  await executor.update(credentials).set({ revokedAt: new Date() }).where(eq(credentials.id, id));
}

export async function recordTest(executor: Executor, id: string, code: string): Promise<void> {
  await executor
    .update(credentials)
    .set({ lastTestedAt: new Date(), lastTestCode: code })
    .where(eq(credentials.id, id));
}

export async function credentialStatus(
  executor: Executor,
  id: string | null,
): Promise<CredentialStatus | null> {
  if (!id) return null;
  const [row] = await executor
    .select({
      id: credentials.id,
      label: credentials.label,
      kind: credentials.kind,
      scope: credentials.scope,
      revokedAt: credentials.revokedAt,
      lastTestedAt: credentials.lastTestedAt,
      lastTestCode: credentials.lastTestCode,
    })
    .from(credentials)
    .where(eq(credentials.id, id));
  if (!row) return null;
  const { revokedAt, ...rest } = row;
  return { ...rest, connected: !revokedAt };
}

/**
 * The only way to read a secret. The value lives inside the callback; callers must not
 * return it, log it or put it in any context. Scope is checked against the caller.
 */
export async function withSecret<T>(
  id: string,
  expected: { kind: CredentialKind; projectId?: string | null },
  use: (secret: string) => Promise<T>,
): Promise<T> {
  const [row] = await db
    .select()
    .from(credentials)
    .where(and(eq(credentials.id, id), isNull(credentials.revokedAt)));
  if (!row || row.kind !== expected.kind) throw new AppError("NOT_FOUND", "Credential missing");
  // Project credentials never cross into another project.
  if (row.scope === "project" && row.projectId !== (expected.projectId ?? null))
    throw new AppError("NOT_FOUND", "Credential missing");
  const secret = open(row);
  return use(secret);
}
