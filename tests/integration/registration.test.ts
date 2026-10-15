import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { auth } from "@/lib/auth/config";
import { createInvitation } from "@/lib/clients/invitations";
import { createClient } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import { auditEvents, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import {
  canRegister,
  isRegistrationEnabled,
  setRegistrationEnabled,
} from "@/lib/platform/settings";
import { createUser, resetDatabase } from "../helpers/db";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

const signUp = (email: string) =>
  auth.api.signUpEmail({ body: { name: "Newcomer", email, password: "Saqina#2026x" } });

let owner: Actor;

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
});

describe("registration switch", () => {
  it("is open by default and only the owner can change it", async () => {
    expect(await isRegistrationEnabled()).toBe(true);
    const member = await createUser("Member");
    expect(await code(setRegistrationEnabled(member, { enabled: false }))).toBe(
      "AUTHORIZATION_ERROR",
    );
    expect(await code(setRegistrationEnabled(owner, { enabled: "no" }))).toBe("VALIDATION_ERROR");
    expect(await isRegistrationEnabled()).toBe(true);
  });

  it("records an audit event when the owner changes it", async () => {
    await setRegistrationEnabled(owner, { enabled: false });
    expect(await isRegistrationEnabled()).toBe(false);
    await setRegistrationEnabled(owner, { enabled: true });
    expect(await isRegistrationEnabled()).toBe(true);
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.type, "platform.registration.changed"));
    expect(events).toHaveLength(2);
  });

  it("blocks sign-up server-side when closed, and allows it again when reopened", async () => {
    await setRegistrationEnabled(owner, { enabled: false });
    // Better Auth answers a 403 from the hook with its generic "check your email" response (so
    // sign-up cannot be used to probe which emails exist). What matters is that no account exists.
    await signUp("stranger@example.test");
    expect(await db.select().from(users).where(eq(users.email, "stranger@example.test"))).toEqual(
      [],
    );
    await setRegistrationEnabled(owner, { enabled: true });
    await signUp("stranger@example.test");
    expect(
      await db.select().from(users).where(eq(users.email, "stranger@example.test")),
    ).toHaveLength(1);
  });

  it("lets a pending client invitation through while closed, for that email only", async () => {
    await setRegistrationEnabled(owner, { enabled: false });
    const c = await createClient(owner, { name: "PT ABC", email: "client@abc.test" });
    await createInvitation(owner, c.id, { email: "Client@ABC.test" });
    expect(await canRegister("client@abc.test")).toBe(true);
    expect(await canRegister("someone.else@abc.test")).toBe(false);
    await signUp("client@abc.test");
    expect(await db.select().from(users).where(eq(users.email, "client@abc.test"))).toHaveLength(1);
    await signUp("other@abc.test");
    expect(await db.select().from(users).where(eq(users.email, "other@abc.test"))).toEqual([]);
  });
});
