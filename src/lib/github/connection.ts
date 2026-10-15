import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { credentials } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { revokeCredential, storeCredential, withSecret } from "@/lib/secrets/service";
import {
  exchangeCode,
  fetchLogin,
  type GithubOAuthError,
  GithubOAuthFailure,
  sameState,
} from "./oauth";

/**
 * A person's GitHub connection: one encrypted OAuth token, owned by the user and never shown to
 * the browser. The label `github:<login>` is the only thing the app reads back about it.
 */

const PREFIX = "github:";

const mine = (userId: string) =>
  and(
    eq(credentials.userId, userId),
    eq(credentials.scope, "user"),
    eq(credentials.kind, "git"),
    isNull(credentials.revokedAt),
  );

export interface GithubConnection {
  login: string;
  connectedAt: Date;
}

export async function getConnection(actor: Actor): Promise<GithubConnection | null> {
  const [row] = await db
    .select({ label: credentials.label, createdAt: credentials.createdAt })
    .from(credentials)
    .where(mine(actor.id))
    .orderBy(desc(credentials.createdAt))
    .limit(1);
  if (!row?.label.startsWith(PREFIX)) return null;
  return { login: row.label.slice(PREFIX.length), connectedAt: row.createdAt };
}

/** Replaces any earlier connection of this user: only one token is ever active. */
export async function saveConnection(actor: Actor, input: { token: string; login: string }) {
  await db.transaction(async (tx) => {
    const old = await tx.select({ id: credentials.id }).from(credentials).where(mine(actor.id));
    for (const row of old) await revokeCredential(tx, row.id);
    const id = await storeCredential(tx, {
      scope: "user",
      kind: "git",
      label: `${PREFIX}${input.login}`,
      secret: input.token,
      userId: actor.id,
      createdBy: actor.id,
    });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "github.connected",
      entityType: "credential",
      entityId: id,
      metadata: { login: input.login },
    });
  });
}

export async function disconnect(actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select({ id: credentials.id }).from(credentials).where(mine(actor.id));
    if (rows.length === 0) return;
    for (const row of rows) await revokeCredential(tx, row.id);
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "github.disconnected",
      entityType: "credential",
      entityId: rows[0].id,
    });
  });
}

/**
 * The only way to use the token: inside the callback, on the server. A missing or revoked
 * connection is NOT_FOUND, the same answer as for someone else's.
 */
export async function withGithubToken<T>(
  actor: Actor,
  use: (token: string) => Promise<T>,
): Promise<T> {
  const [row] = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(mine(actor.id))
    .orderBy(desc(credentials.createdAt))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "GitHub is not connected");
  return withSecret(row.id, { kind: "git" }, use);
}

export type CallbackResult = { ok: true; login: string } | { ok: false; error: GithubOAuthError };

/**
 * Finishes the OAuth round trip. The state in the URL must equal the one in the visitor's own
 * cookie (CSRF), and the person who started it is the signed-in actor. Nothing is stored unless
 * every step succeeds.
 */
export async function completeConnect(
  actor: Actor,
  input: {
    code: string | null;
    state: string | null;
    error: string | null;
    cookieState: string | null;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<CallbackResult> {
  if (input.error) return { ok: false, error: "denied" };
  if (!input.code || !sameState(input.state, input.cookieState))
    return { ok: false, error: "invalid_state" };
  try {
    const token = await exchangeCode(
      {
        code: input.code,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        redirectUri: input.redirectUri,
      },
      fetchImpl,
    );
    const login = await fetchLogin(token, fetchImpl);
    await saveConnection(actor, { token, login });
    return { ok: true, login };
  } catch (error) {
    if (error instanceof GithubOAuthFailure) return { ok: false, error: error.code };
    throw error;
  }
}
