import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { auditEvents, notifications, rateLimits, sessions, verifications } from "@/lib/db/schema";
import { runMaintenance } from "@/lib/housekeeping/service";
import { createUser, resetDatabase } from "../helpers/db";

const day = 24 * 60 * 60 * 1000;
describe("runMaintenance", () => {
  beforeEach(resetDatabase);

  it("removes expired sessions, verifications and old counters only", async () => {
    const user = await createUser();
    const past = new Date(Date.now() - day);
    const future = new Date(Date.now() + day);
    await db.insert(sessions).values([
      { id: "s-old", token: "t-old", userId: user.id, expiresAt: past, updatedAt: past },
      { id: "s-new", token: "t-new", userId: user.id, expiresAt: future, updatedAt: new Date() },
    ]);
    await db.insert(verifications).values([
      { id: "v-old", identifier: "a", value: "x", expiresAt: past },
      { id: "v-new", identifier: "b", value: "x", expiresAt: future },
    ]);
    await db.insert(rateLimits).values([
      { key: "old", count: 3, windowStart: new Date(Date.now() - 3 * day) },
      { key: "fresh", count: 1, windowStart: new Date() },
    ]);

    const result = await runMaintenance(new Date());
    expect(result).toMatchObject({ sessions: 1, verifications: 1, rateLimits: 1 });
    expect((await db.select().from(sessions)).map((s) => s.id)).toEqual(["s-new"]);
    expect((await db.select().from(verifications)).map((v) => v.id)).toEqual(["v-new"]);
    expect((await db.select().from(rateLimits)).map((r) => r.key)).toEqual(["fresh"]);
  });

  it("applies the retention table: old read notifications and audit events go, unread and recent stay", async () => {
    const user = await createUser();
    const old = new Date(Date.now() - 800 * day);
    const recent = new Date(Date.now() - 5 * day);
    const note = (title: string, readAt: Date | null, createdAt: Date) => ({
      userId: user.id,
      type: "mention" as never,
      dedupKey: title,
      readAt,
      createdAt,
    });
    await db
      .insert(notifications)
      .values([
        note("old read", old, old),
        note("old unread", null, old),
        note("recent read", recent, recent),
      ] as never);
    await db.insert(auditEvents).values([
      { scope: "platform", type: "x.old", entityType: "t", createdAt: old },
      { scope: "platform", type: "x.new", entityType: "t", createdAt: recent },
    ] as never);

    const result = await runMaintenance(new Date());
    expect(result).toMatchObject({ notifications: 1, auditEvents: 1 });
    expect((await db.select().from(notifications)).map((n) => n.dedupKey).sort()).toEqual([
      "old unread",
      "recent read",
    ]);
    expect((await db.select().from(auditEvents)).map((e) => e.type)).toEqual(["x.new"]);
  });
});
