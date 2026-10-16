import { describe, expect, it } from "vitest";
import { checkPrd, type PrdCheckInput } from "@/lib/brain/prd-check";

const base: PrdCheckInput = {
  prd: "# PRD\n\n## Goals\nSell cakes online.\n\n## Features\nCheckout with card payment.\n",
  requirements: [],
  tasks: [],
  scope: [],
};
const kinds = (i: PrdCheckInput) => checkPrd(i).map((c) => c.kind);

describe("checkPrd", () => {
  it("reports nothing for a consistent project and for a project without a PRD", () => {
    expect(checkPrd(base)).toEqual([]);
    expect(checkPrd({ ...base, prd: null })).toEqual([]);
  });

  it("flags empty or placeholder sections", () => {
    const prd = "# PRD\n\n## Goals\nTBD\n\n## Risks\n\n## Features\nReal text.\n";
    const found = checkPrd({ ...base, prd });
    expect(found.map((f) => f.subject)).toEqual(["Goals", "Risks"]);
    expect(found[0].fingerprint).toBe("placeholder_section:goals");
  });

  it("flags confirmed requirements the PRD does not mention, but not system-written ones", () => {
    const requirements = [
      { id: "r1", title: "Card payment", group: "features", status: "confirmed", source: "user" },
      { id: "r2", title: "Loyalty points", group: "features", status: "confirmed", source: "user" },
      { id: "r3", title: "Dark mode", group: "features", status: "confirmed", source: "imported" },
      { id: "r4", title: "Wishlist", group: "features", status: "inferred", source: "user" },
      { id: "r5", title: "Budget", group: "assumptions", status: "confirmed", source: "user" },
    ];
    const found = checkPrd({ ...base, requirements });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: "requirement_not_in_prd",
      entityId: "r2",
      fingerprint: "requirement_not_in_prd:r2",
    });
  });

  it("flags requirements and open tasks that the recorded scope excludes or postpones", () => {
    const scope = [
      { id: "s1", title: "Mobile app", category: "excluded" as const },
      { id: "s2", title: "Chat support", category: "future" as const },
    ];
    const found = checkPrd({
      ...base,
      prd: `${base.prd}\nMobile app\n`,
      scope,
      requirements: [
        { id: "r1", title: "Mobile app", group: "features", status: "confirmed", source: "user" },
      ],
      tasks: [
        { id: "t1", title: "Add chat support", status: "todo" },
        { id: "t2", title: "Add chat support", status: "done" },
        { id: "t3", title: "Write copy", status: "todo" },
      ],
    });
    expect(found.map((f) => f.fingerprint).sort()).toEqual([
      "requirement_out_of_scope:r1",
      "task_out_of_scope:t1",
    ]);
  });

  it("gives the same disagreement the same fingerprint every time", () => {
    const input = { ...base, prd: "# PRD\n\n## Goals\nTBD\n" };
    expect(checkPrd(input)[0].fingerprint).toBe(checkPrd(input)[0].fingerprint);
    expect(kinds(input)).toEqual(["placeholder_section"]);
  });
});
