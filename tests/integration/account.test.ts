import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount, planDeletion } from "@/lib/account/delete";
import { exportAccount } from "@/lib/account/export";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { auditEvents, projectMembers, projects, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { createMemory } from "@/lib/memory/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

vi.mock("server-only", () => ({}));

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

let alice: Actor;
let bob: Actor;

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  bob = await createUser("Bob");
});

describe("account export", () => {
  it("holds the person's own data and no secrets or other people's content", async () => {
    const slug = await project(alice, "A web shop with login and payments for my bakery.");
    await createMemory(alice, slug, {
      title: "Mine",
      content: "my note",
      category: "product",
      importance: "normal",
    });
    const slugB = await project(bob, "A recipe sharing app for home cooks and friends.");
    await createMemory(bob, slugB, {
      title: "Bobs private note",
      content: "bob only",
      category: "product",
      importance: "normal",
    });

    const out = await exportAccount(alice);
    const text = JSON.stringify(out);
    expect(out.profile.email).toBe(alice.email);
    expect(out.authored.memories.map((m) => m.title)).toContain("Mine");
    expect(text).not.toContain("Bobs private note");
    expect(text).not.toContain(bob.email);
    expect(text).not.toMatch(/"(token|password|accessToken|secret|ciphertext)"/i);
    expect(out.notIncluded.length).toBeGreaterThan(0);
  });

  it("is audited and rate limited", async () => {
    for (let i = 0; i < 3; i++) await exportAccount(alice);
    expect(await code(exportAccount(alice))).toBe("RATE_LIMIT");
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.type, "account.exported"));
    expect(events).toHaveLength(3);
  });
});

describe("account deletion", () => {
  it("refuses a wrong email and changes nothing", async () => {
    expect(await code(deleteAccount(alice, { confirmEmail: bob.email }))).toBe("VALIDATION_ERROR");
    expect(await db.select().from(users).where(eq(users.id, alice.id))).toHaveLength(1);
  });

  it("blocks while a project is shared with others, and names it", async () => {
    const slug = await project(alice, "A web shop with login and payments for my bakery.");
    const a = await loadProjectAccess(alice, { slug }, "project:read");
    await db
      .insert(projectMembers)
      .values({ projectId: a.project.id, userId: bob.id, role: "editor" });

    const plan = await planDeletion(alice);
    expect(plan.blockers).toContain("ownsSharedProjects");
    expect(plan.sharedProjects).toEqual([slug]);
    expect(await code(deleteAccount(alice, { confirmEmail: alice.email }))).toBe("CONFLICT");
    expect(await db.select().from(users).where(eq(users.id, alice.id))).toHaveLength(1);
  });

  it("blocks the last platform owner", async () => {
    await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, alice.id));
    expect((await planDeletion(alice)).blockers).toContain("lastPlatformOwner");
    await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, bob.id));
    expect((await planDeletion(alice)).blockers).not.toContain("lastPlatformOwner");
  });

  it("removes the account and solo projects, keeps other people's data, audits without PII", async () => {
    await project(alice, "A web shop with login and payments for my bakery.");
    const slugB = await project(bob, "A recipe sharing app for home cooks and friends.");

    await deleteAccount(alice, { confirmEmail: alice.email.toUpperCase() });

    expect(await db.select().from(users).where(eq(users.id, alice.id))).toHaveLength(0);
    expect(await db.select().from(users).where(eq(users.id, bob.id))).toHaveLength(1);
    expect(await db.select().from(projects).where(eq(projects.slug, slugB))).toHaveLength(1);
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.type, "account.deleted"));
    expect(event.actorId).toBeNull();
    expect(JSON.stringify(event)).not.toContain(alice.email);
    expect(JSON.stringify(event)).not.toContain(alice.id);
  });
});
