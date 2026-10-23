import { describe, expect, it } from "vitest";
import { documentReference, isSignable, SIGNABLE_KINDS } from "@/lib/documents/reference";

describe("document reference numbers", () => {
  it("is the kind, the year and a padded number", () => {
    expect(documentReference("proposal", 2026, 1)).toBe("PRP-2026-001");
    expect(documentReference("agreement", 2026, 42)).toBe("AGR-2026-042");
    expect(documentReference("handover", 2027, 1000)).toBe("HND-2027-1000");
    expect(documentReference("maintenance_agreement", 2026, 7)).toBe("MNT-2026-007");
  });

  it("knows which documents two parties sign", () => {
    for (const kind of SIGNABLE_KINDS) expect(isSignable(kind)).toBe(true);
    for (const other of ["prd", "plan", "custom", "notes", ""])
      expect(isSignable(other)).toBe(false);
  });
});
