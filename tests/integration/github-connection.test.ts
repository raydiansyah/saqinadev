import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { auditEvents, credentials } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import {
  completeConnect,
  disconnect,
  getConnection,
  saveConnection,
  withGithubToken,
} from "@/lib/github/connection";
import { createUser, resetDatabase } from "../helpers/db";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

const github = (opts: { token?: string; login?: string; tokenStatus?: number } = {}) =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("login/oauth/access_token"))
      return new Response(JSON.stringify({ access_token: opts.token ?? "gho_realtoken123456" }), {
        status: opts.tokenStatus ?? 200,
      });
    return new Response(JSON.stringify({ login: opts.login ?? "octocat" }));
  }) as unknown as typeof fetch;

const base = {
  clientId: "id",
  clientSecret: "secret",
  redirectUri: "https://x.test/api/github/callback",
};

let ana: Actor;
let ben: Actor;

beforeEach(async () => {
  await resetDatabase();
  ana = await createUser("Ana");
  ben = await createUser("Ben");
});

describe("github connection", () => {
  it("stores the token encrypted and only ever shows the login", async () => {
    await saveConnection(ana, { token: "gho_secret_value_1", login: "ana-dev" });
    expect(await getConnection(ana)).toMatchObject({ login: "ana-dev" });
    const rows = await db.select().from(credentials);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain("gho_secret_value_1");
    expect(rows[0]).toMatchObject({ scope: "user", kind: "git", userId: ana.id });
    await expect(withGithubToken(ana, async (t) => t)).resolves.toBe("gho_secret_value_1");
  });

  it("keeps one active token per user and replaces the old one", async () => {
    await saveConnection(ana, { token: "gho_first_token_000", login: "ana-dev" });
    await saveConnection(ana, { token: "gho_second_token_00", login: "ana-new" });
    expect((await getConnection(ana))?.login).toBe("ana-new");
    const active = await db.select().from(credentials);
    expect(active.filter((c) => c.revokedAt === null)).toHaveLength(1);
    await expect(withGithubToken(ana, async (t) => t)).resolves.toBe("gho_second_token_00");
  });

  it("never hands one user's token to another", async () => {
    await saveConnection(ana, { token: "gho_ana_token_0000", login: "ana-dev" });
    expect(await getConnection(ben)).toBeNull();
    expect(await code(withGithubToken(ben, async (t) => t))).toBe("NOT_FOUND");
  });

  it("disconnect revokes the token and records it", async () => {
    await saveConnection(ana, { token: "gho_ana_token_0000", login: "ana-dev" });
    await disconnect(ana);
    expect(await getConnection(ana)).toBeNull();
    expect(await code(withGithubToken(ana, async (t) => t))).toBe("NOT_FOUND");
    const log = await db.select().from(auditEvents).where(eq(auditEvents.actorId, ana.id));
    expect(log.map((a) => a.type).sort()).toEqual(["github.connected", "github.disconnected"]);
    // Nothing to do the second time, and no second audit event.
    await disconnect(ana);
    expect(
      (
        await db
          .select()
          .from(auditEvents)
          .where(and(eq(auditEvents.type, "github.disconnected")))
      ).length,
    ).toBe(1);
  });

  it("does not put the token in the audit trail", async () => {
    await saveConnection(ana, { token: "gho_leaky_token_999", login: "ana-dev" });
    expect(JSON.stringify(await db.select().from(auditEvents))).not.toContain(
      "gho_leaky_token_999",
    );
  });
});

describe("completing the OAuth round trip", () => {
  const input = (over: Record<string, string | null> = {}) => ({
    code: "abc",
    state: "state-1",
    error: null,
    cookieState: "state-1",
    ...base,
    ...over,
  });

  it("connects when the state matches the visitor's own cookie", async () => {
    const result = await completeConnect(ana, input(), github({ login: "ana-dev" }));
    expect(result).toEqual({ ok: true, login: "ana-dev" });
    expect((await getConnection(ana))?.login).toBe("ana-dev");
  });

  it("refuses a missing, wrong or absent state and stores nothing", async () => {
    for (const bad of [
      input({ state: "other" }),
      input({ state: null }),
      input({ cookieState: null }),
      input({ code: null }),
    ])
      expect(await completeConnect(ana, bad, github())).toEqual({
        ok: false,
        error: "invalid_state",
      });
    expect(await db.select().from(credentials)).toEqual([]);
  });

  it("reports a refusal on GitHub's side", async () => {
    expect(await completeConnect(ana, input({ error: "access_denied" }), github())).toEqual({
      ok: false,
      error: "denied",
    });
  });

  it("stores nothing when the code exchange or the profile lookup fails", async () => {
    expect(await completeConnect(ana, input(), github({ tokenStatus: 500 }))).toEqual({
      ok: false,
      error: "exchange_failed",
    });
    expect(await db.select().from(credentials)).toEqual([]);
  });
});
