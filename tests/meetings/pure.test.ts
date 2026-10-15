import { describe, expect, it } from "vitest";
import { type KnownEntities, type RawItem, verifyItems } from "@/lib/meetings/verify";

const known: KnownEntities = {
  requirements: [{ id: "req-1", title: "Customer can pay with a payment gateway" }],
  tasks: [{ id: "task-1", title: "Build the login page" }],
  decisions: [{ id: "dec-1", title: "Which database to use?" }],
  scope: [
    { id: "scope-1", title: "Mobile app", category: "excluded" },
    { id: "scope-2", title: "Invoice export", category: "included" },
  ],
};

const body =
  "We talked about the Reports page.\nThe client wants a weekly   sales report by email.";

const raw = (over: Partial<RawItem> = {}): RawItem => ({
  text: "Add a weekly sales report email",
  quote: "weekly sales report by email",
  classification: "new_in_scope",
  confidence: 90,
  rationale: "Asked for by the client.",
  ...over,
});

const one = (over: Partial<RawItem>) => verifyItems([raw(over)], body, known)[0];

describe("verifyItems", () => {
  it("keeps a clean item as it is", () => {
    expect(one({})).toMatchObject({
      classification: "new_in_scope",
      confidence: 90,
      quote: "weekly sales report by email",
    });
  });

  it("matches quotes regardless of case and spacing", () => {
    expect(one({ quote: "WEEKLY sales   report BY email" }).quote).not.toBe("");
  });

  it("drops an invented quote and lowers confidence", () => {
    const item = one({ quote: "the budget is ten million" });
    expect(item.quote).toBe("");
    expect(item.confidence).toBeLessThanOrEqual(40);
  });

  it("ignores a match that points at nothing real", () => {
    const item = one({ classification: "revision", matchedType: "task", matchedId: "task-999" });
    expect(item.matchedId).toBeNull();
    expect(item.classification).toBe("unclear");
    expect(item.confidence).toBeLessThanOrEqual(40);
  });

  it("rejects a match of the wrong kind", () => {
    const item = one({
      classification: "revision",
      matchedType: "requirement",
      matchedId: "task-1",
    });
    expect(item.matchedId).toBeNull();
  });

  it("keeps a valid revision with its match", () => {
    const item = one({ classification: "revision", matchedType: "task", matchedId: "task-1" });
    expect(item).toMatchObject({ classification: "revision", matchedId: "task-1" });
  });

  it("turns a duplicate of a planned requirement into a duplicate", () => {
    const item = one({ text: "Customers pay with the payment gateway" });
    expect(item).toMatchObject({
      classification: "duplicate",
      matchedType: "requirement",
      matchedId: "req-1",
    });
  });

  it("lets the recorded scope overrule an in-scope claim", () => {
    const item = one({ text: "Build a mobile app for customers" });
    expect(item).toMatchObject({ classification: "conflict", matchedId: "scope-1" });
    expect(item.confidence).toBeLessThanOrEqual(50);
  });

  it("flags an out-of-scope claim for something the scope already includes", () => {
    const item = one({ text: "Export invoice to PDF", classification: "out_of_scope" });
    expect(item).toMatchObject({ classification: "conflict", matchedId: "scope-2" });
  });

  it("leaves an out-of-scope claim alone when the scope says nothing", () => {
    expect(
      one({ text: "Add a loyalty programme", classification: "out_of_scope" }).classification,
    ).toBe("out_of_scope");
  });

  it("clamps confidence to 0..100", () => {
    expect(one({ confidence: 250 }).confidence).toBe(100);
    expect(one({ confidence: -5 }).confidence).toBe(0);
    expect(one({ confidence: Number.NaN }).confidence).toBe(0);
  });
});
