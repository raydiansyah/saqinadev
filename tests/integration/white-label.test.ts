import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { auditEvents, users, whiteLabelGrants } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import {
  assertWhiteLabelUnlocked,
  grantWhiteLabel,
  listWhiteLabel,
  revokeWhiteLabel,
  whiteLabelState,
} from "@/lib/white-label/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let platform: Actor;
let member: Actor;
let stranger: Actor;
let orgId: string;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

beforeEach(async () => {
  await resetDatabase();
  platform = await createUser("Platform", "platform@example.test");
  member = await createUser("Member", "member@example.test");
  stranger = await createUser("Stranger", "stranger@example.test");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, platform.id));
  // A project creates the member's organization.
  const slug = await project(member, "A point of sale for a small restaurant with table orders.");
  orgId = (await loadProjectAccess(member, { slug }, "project:read")).project.organizationId;
});

describe("white label is locked until a plan or an agreement opens it", () => {
  it("is locked by default, and the gate refuses", async () => {
    expect(await whiteLabelState(orgId)).toEqual({ unlocked: false, reason: "never_granted" });
    expect(await code(assertWhiteLabelUnlocked(orgId))).toBe("AUTHORIZATION_ERROR");
  });

  it("opens with a paid plan or an agreement, and keeps what opened it", async () => {
    await grantWhiteLabel(platform, {
      organizationId: orgId,
      basis: "agreement",
      reference: "AGR-2027-004",
      validUntil: "",
    });
    expect(await whiteLabelState(orgId)).toMatchObject({
      unlocked: true,
      basis: "agreement",
      reference: "AGR-2027-004",
      validUntil: null,
    });
    await assertWhiteLabelUnlocked(orgId);
    const audit = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.type, "whitelabel.granted"));
    expect(audit).toHaveLength(1);
  });

  it("a new grant replaces the old one, and only one is ever open", async () => {
    await grantWhiteLabel(platform, {
      organizationId: orgId,
      basis: "paid_plan",
      reference: "PLAN-PRO",
      validUntil: "",
    });
    await grantWhiteLabel(platform, {
      organizationId: orgId,
      basis: "agreement",
      reference: "AGR-2027-004",
      validUntil: "",
    });
    const rows = await db
      .select()
      .from(whiteLabelGrants)
      .where(eq(whiteLabelGrants.organizationId, orgId));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
    expect(await whiteLabelState(orgId)).toMatchObject({ reference: "AGR-2027-004" });
  });

  it("closes when it is revoked or its end date passes, and says why", async () => {
    await grantWhiteLabel(platform, {
      organizationId: orgId,
      basis: "paid_plan",
      reference: "PLAN-PRO",
      validUntil: "2099-01-01",
    });
    expect(await whiteLabelState(orgId, "2099-01-01")).toMatchObject({ unlocked: true });
    expect(await whiteLabelState(orgId, "2099-01-02")).toEqual({
      unlocked: false,
      reason: "expired",
    });
    await revokeWhiteLabel(platform, { organizationId: orgId });
    expect(await whiteLabelState(orgId)).toEqual({ unlocked: false, reason: "revoked" });
    expect(await code(assertWhiteLabelUnlocked(orgId))).toBe("AUTHORIZATION_ERROR");
  });

  it("is the platform owner's switch: a member or a stranger gets not found", async () => {
    for (const who of [member, stranger])
      expect(
        await code(
          grantWhiteLabel(who, {
            organizationId: orgId,
            basis: "paid_plan",
            reference: "PLAN-PRO",
            validUntil: "",
          }),
        ),
      ).toBe("NOT_FOUND");
    expect(await code(revokeWhiteLabel(member, { organizationId: orgId }))).toBe("NOT_FOUND");
    expect(await whiteLabelState(orgId)).toMatchObject({ unlocked: false });
  });

  it("validates what it records", async () => {
    const base = {
      organizationId: orgId,
      basis: "paid_plan",
      reference: "PLAN-PRO",
      validUntil: "",
    };
    expect(await code(grantWhiteLabel(platform, { ...base, basis: "gift" }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await code(grantWhiteLabel(platform, { ...base, reference: "x" }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await code(grantWhiteLabel(platform, { ...base, validUntil: "2020-01-01" }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(
      await code(grantWhiteLabel(platform, { ...base, organizationId: crypto.randomUUID() })),
    ).toBe("NOT_FOUND");
  });

  it("shows a member their own organizations, locked, and the platform owner all of them", async () => {
    const mine = await listWhiteLabel(member);
    expect(mine.map((o) => o.organizationId)).toContain(orgId);
    expect(mine.every((o) => !o.state.unlocked)).toBe(true);
    expect((await listWhiteLabel(stranger)).map((o) => o.organizationId)).not.toContain(orgId);
    expect((await listWhiteLabel(platform)).map((o) => o.organizationId)).toContain(orgId);
  });
});
