import { describe, expect, it } from "vitest";
import { evaluateGrant, WHITE_LABEL_BASES } from "@/lib/white-label/policy";

const grant = (over: Partial<Parameters<typeof evaluateGrant>[0] & object> = {}) => ({
  basis: "paid_plan" as const,
  reference: "PLAN-PRO",
  grantedAt: new Date("2027-01-01T00:00:00Z"),
  validUntil: null,
  revokedAt: null,
  ...over,
});

describe("when white label is open", () => {
  it("is locked with no grant", () => {
    expect(evaluateGrant(null, "2027-02-27")).toEqual({ unlocked: false, reason: "never_granted" });
  });

  it("is open with a paid plan or an agreement, with no end date or before it", () => {
    for (const basis of WHITE_LABEL_BASES) {
      expect(evaluateGrant(grant({ basis }), "2027-02-27")).toMatchObject({
        unlocked: true,
        basis,
      });
      expect(evaluateGrant(grant({ basis, validUntil: "2027-02-27" }), "2027-02-27").unlocked).toBe(
        true,
      );
    }
  });

  it("locks the day after its end date, and when revoked, whichever comes first", () => {
    expect(evaluateGrant(grant({ validUntil: "2027-02-26" }), "2027-02-27")).toEqual({
      unlocked: false,
      reason: "expired",
    });
    expect(
      evaluateGrant(grant({ revokedAt: new Date(), validUntil: "2020-01-01" }), "2027-02-27"),
    ).toEqual({ unlocked: false, reason: "revoked" });
  });
});
