import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import {
  aiUsageRecords,
  auditEvents,
  notifications,
  rateLimits,
  serviceInquiries,
  sessions,
  verifications,
} from "@/lib/db/schema";
import { retentionDays, runMaintenance } from "@/lib/housekeeping/service";
import { createUser, resetDatabase } from "../helpers/db";

const day = 24 * 60 * 60 * 1000;
const inquiry = (status: "new" | "converted", ageDays: number) => ({
  name: "Test",
  email: `t-${status}-${ageDays}@example.test`,
  message: "A long enough message",
  consent: true,
  locale: "en",
  status,
  createdAt: new Date(Date.now() - ageDays * day),
});

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

    const result = await runMaintenance(new Date(), {});
    expect(result).toMatchObject({ sessions: 1, verifications: 1, rateLimits: 1, inquiries: 0 });
    expect((await db.select().from(sessions)).map((s) => s.id)).toEqual(["s-new"]);
    expect((await db.select().from(verifications)).map((v) => v.id)).toEqual(["v-new"]);
    expect((await db.select().from(rateLimits)).map((r) => r.key)).toEqual(["fresh"]);
  });

  it("keeps inquiries unless a retention period is set, and never deletes converted ones", async () => {
    await db
      .insert(serviceInquiries)
      .values([inquiry("new", 400), inquiry("new", 10), inquiry("converted", 400)]);

    expect((await runMaintenance(new Date(), {})).inquiries).toBe(0);
    expect(await db.select().from(serviceInquiries)).toHaveLength(3);

    const result = await runMaintenance(new Date(), { INQUIRY_RETENTION_DAYS: "365" });
    expect(result).toMatchObject({ inquiries: 1, inquiryRetentionDays: 365 });
    const left = await db.select().from(serviceInquiries);
    expect(left.map((i) => i.status).sort()).toEqual(["converted", "new"]);
    expect(
      await db.select().from(serviceInquiries).where(eq(serviceInquiries.status, "new")),
    ).toHaveLength(1);
  });

  it("applies the retention table: old read notifications, usage and audit go, unread and recent stay", async () => {
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
    await db.insert(aiUsageRecords).values([
      { operation: "chat", durationMs: 1, status: "succeeded", createdAt: old },
      { operation: "chat", durationMs: 1, status: "succeeded", createdAt: recent },
    ] as never);

    const result = await runMaintenance(new Date(), {});
    expect(result).toMatchObject({ notifications: 1, auditEvents: 1, aiUsage: 1 });
    expect((await db.select().from(notifications)).map((n) => n.dedupKey).sort()).toEqual([
      "old unread",
      "recent read",
    ]);
    expect((await db.select().from(auditEvents)).map((e) => e.type)).toEqual(["x.new"]);
    expect(await db.select().from(aiUsageRecords)).toHaveLength(1);
  });

  it("parses the retention setting strictly", () => {
    expect(retentionDays("365")).toBe(365);
    for (const bad of [undefined, "", "0", "-5", "1.5", "abc"])
      expect(retentionDays(bad)).toBeNull();
  });
});
