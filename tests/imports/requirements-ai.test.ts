import { describe, expect, it } from "vitest";
import { groundItems } from "@/lib/imports/requirements-ai";

const docs = [
  {
    path: "docs/overview.md",
    content:
      "The bakery takes pre-orders until 18:00 the day before.\nCustomers collect them in a pickup slot of their choice.",
  },
  { path: "README.md", content: "A loyalty card gives every tenth loaf for free." },
];

const item = (over: Record<string, unknown> = {}) => ({
  group: "features" as const,
  title: "Pickup slots",
  description: "Customers choose when to collect.",
  quote: "pickup slot of their choice",
  ...over,
});

describe("groundItems", () => {
  it("keeps an item whose quote is in a document and names that document as the source", () => {
    const [r] = groundItems([item()], docs);
    expect(r.title).toBe("Pickup slots");
    expect(r.description).toContain("Source: docs/overview.md (read by AI)");
  });

  it("finds the quote in whichever document holds it, ignoring case and spacing", () => {
    const [r] = groundItems(
      [item({ title: "Loyalty", quote: "EVERY  tenth LOAF for free" })],
      docs,
    );
    expect(r.description).toContain("README.md");
  });

  it("drops items whose quote is not in any document", () => {
    expect(groundItems([item({ quote: "customers can pay by cryptocurrency" })], docs)).toEqual([]);
  });

  it("drops empty titles and strips control characters", () => {
    expect(groundItems([item({ title: "\u0007  " })], docs)).toEqual([]);
    const [r] = groundItems([item({ title: "Pick\u0007up" })], docs);
    expect(r.title).toBe("Pickup");
  });
});
