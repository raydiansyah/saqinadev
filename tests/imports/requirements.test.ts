import { describe, expect, it } from "vitest";
import { extractRequirements } from "@/lib/imports/requirements";

const extract = (content: string, path = "PRD.md", existing: string[] = []) =>
  extractRequirements([{ path, content }], existing);

describe("extractRequirements", () => {
  it("takes the bullets of feature and rule sections, grouped by the heading", () => {
    const out = extract(`# PRD

## Features
- Customers reserve a pickup time slot
- Bakers see a daily production list

## Business rules
- Pre-orders close at 18:00 the day before pickup
`);
    expect(out.map((r) => [r.group, r.title])).toEqual([
      ["features", "Customers reserve a pickup time slot"],
      ["features", "Bakers see a daily production list"],
      ["business_rules", "Pre-orders close at 18:00 the day before pickup"],
    ]);
  });

  it("names where each one came from", () => {
    const [r] = extract("## Features\n- Customers can export invoices as PDF\n", "docs/spec.md");
    expect(r.description).toContain("Source: docs/spec.md › Features");
  });

  it("splits 'Title: detail' bullets and keeps nested bullets as detail", () => {
    const [r] = extract(`## Features
- **Loyalty stamps**: every tenth loaf is free
  - stamps never expire
  - one card per customer
`);
    expect(r.title).toBe("Loyalty stamps");
    expect(r.description).toContain("every tenth loaf is free");
    expect(r.description).toContain("stamps never expire");
    expect(extract("## Features\n- Loyalty stamps for regulars\n  - never expire\n")).toHaveLength(
      1,
    );
  });

  it("ignores lists that describe the repository, not the product", () => {
    expect(
      extract(
        `# Bakery

## Installation
- Run pnpm install first
- Copy the env file

## Contributing
- Fork the repository and open a pull request

## Tech stack
- Next.js and PostgreSQL for everything
`,
        "README.md",
      ),
    ).toEqual([]);
  });

  it("ignores code blocks and links-only lines", () => {
    expect(
      extract(
        "## Features\n```\n- not a requirement inside a code block\n```\n- https://example.com/docs\n",
      ),
    ).toEqual([]);
  });

  it("reads Indonesian headings and mixed-case task lists", () => {
    const out = extract(`## Fitur
- [ ] Pelanggan memilih jam pengambilan pesanan
- [x] Pembayaran lewat transfer bank

## Aturan bisnis
1. Pre-order ditutup pukul 18.00
`);
    expect(out.map((r) => r.group)).toEqual(["features", "features", "business_rules"]);
  });

  it("treats the bullets of a PRD as requirements even under unusual headings", () => {
    const [r] = extract(
      "# Product\n\n## What bakers need\n- A printed production sheet each morning\n",
      "PRD.md",
    );
    expect(r).toMatchObject({
      group: "features",
      title: "A printed production sheet each morning",
    });
    // The same heading in a README is not assumed to be a requirement list.
    expect(
      extract("## What bakers need\n- A printed production sheet each morning\n", "README.md"),
    ).toEqual([]);
  });

  it("skips repeats within the documents and items the project already has", () => {
    const out = extract(
      "## Features\n- Customers reserve a pickup slot\n- Customer reserves pickup slots\n- Order status by WhatsApp\n",
      "PRD.md",
      ["Order status updates by WhatsApp message"],
    );
    expect(out.map((r) => r.title)).toEqual(["Customers reserve a pickup slot"]);
  });

  it("caps the number and the length of what it returns", () => {
    const many = Array.from(
      { length: 100 },
      (_, i) => `- Feature number ${i} with unique wording ${"x".repeat(i)}q${i}`,
    ).join("\n");
    const out = extract(`## Features\n${many}\n- ${"long ".repeat(100)}\n`);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.every((r) => r.title.length <= 160 && r.description.length <= 2000)).toBe(true);
  });
});
