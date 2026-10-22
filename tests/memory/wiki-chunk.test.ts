import { describe, expect, it } from "vitest";
import { parseMarkdown, refKey, resolveTarget } from "@/lib/memory/wiki/chunk";

const DOC = `# Payments

Orders are paid through Midtrans.

## Refunds

Refunds go back to the original method within 7 days.

- Partial refunds are allowed
- Cash refunds are not

\`\`\`
# not a heading
[not a link](nope.md)
\`\`\`

See [the plan](../PLAN.md), [[Billing rules]] and [site](https://example.com).
`;

describe("markdown reading", () => {
  const page = parseMarkdown(DOC, "fallback", { fromPath: "docs/specs/payments.md" });

  it("takes the title, a plain summary and the outline", () => {
    expect(page.title).toBe("Payments");
    expect(page.summary).toBe("Orders are paid through Midtrans.");
    expect(page.outline).toEqual(["Payments", "  Refunds"]);
  });

  it("keeps the heading path and the lines of every passage", () => {
    expect(page.chunks[0]).toMatchObject({
      heading: "Payments",
      startLine: 3,
      endLine: 3,
      content: "Orders are paid through Midtrans.",
    });
    const refunds = page.chunks.filter((c) => c.heading === "Payments › Refunds");
    expect(refunds.length).toBeGreaterThan(0);
    expect(refunds[0].startLine).toBe(7);
    // A heading inside a code fence is text, not structure.
    expect(page.outline.join()).not.toContain("not a heading");
    expect(page.chunks.map((c, i) => c.ordinal === i).every(Boolean)).toBe(true);
  });

  it("resolves links relative to the file and ignores external and code links", () => {
    expect(page.links).toEqual([
      { targetRef: "docs/plan", label: "the plan" },
      { targetRef: "billing rules", label: "Billing rules" },
    ]);
  });

  it("splits a long section into passages that fit and still cover every line", () => {
    const long = `# Big\n\n${Array.from({ length: 60 }, (_, i) => `Line ${i} ${"word ".repeat(10)}`).join("\n")}\n`;
    const parsed = parseMarkdown(long, "x", { maxChars: 300 });
    expect(parsed.chunks.length).toBeGreaterThan(3);
    expect(parsed.chunks.every((c) => c.content.length <= 300)).toBe(true);
    expect(parsed.chunks.at(-1)?.endLine).toBe(62);
    expect(parsed.chunks[1].startLine).toBe(parsed.chunks[0].endLine + 1);
  });

  it("falls back to the given title and copes with an empty text", () => {
    expect(parseMarkdown("just text", "Fallback").title).toBe("Fallback");
    expect(parseMarkdown("", "Empty")).toMatchObject({ chunks: [], links: [], summary: "" });
  });
});

describe("link targets", () => {
  it("normalises names and resolves paths", () => {
    expect(refKey("./Docs/PRD.md")).toBe("docs/prd");
    expect(resolveTarget("docs/a/b.md", "../c.md#top")).toBe("docs/c");
    expect(resolveTarget(null, "Plan.md")).toBe("plan");
    expect(resolveTarget("docs/a.md", "mailto:x@y.z")).toBeNull();
    expect(resolveTarget("docs/a.md", "https://x.dev/y")).toBeNull();
  });
});

describe("hostile text", () => {
  const fast = (text: string) => {
    const t = Date.now();
    const page = parseMarkdown(text, "x", { fromPath: "docs/a.md" });
    expect(Date.now() - t).toBeLessThan(1000);
    return page;
  };

  it("reads long heading, bracket and link lines in bounded time", () => {
    fast(`# a${" ".repeat(50_000)}b\n\ntext\n`);
    fast(`${"[".repeat(100_000)}\n`);
    fast(`${"[x](".repeat(20_000)}\n`);
    fast(`${"[[".repeat(50_000)}\n`);
  });

  it("survives a link that is not valid percent-encoding", () => {
    const page = parseMarkdown("See [half](50%) and [ok](ok.md).", "x", { fromPath: "docs/a.md" });
    expect(page.links.map((l) => l.targetRef)).toEqual(["docs/50%", "docs/ok"]);
  });

  it("clamps long headings and keeps the heading path short", () => {
    const page = parseMarkdown(`# ${"H".repeat(5000)}\n\n## ${"S".repeat(5000)}\n\nbody\n`, "x");
    expect(page.chunks[0].heading.length).toBeLessThanOrEqual(500);
    expect(page.outline.every((o) => o.trim().length <= 200)).toBe(true);
  });

  it("keeps a trailing # that is part of the title and strips a closing run", () => {
    expect(parseMarkdown("# C#\n", "x").title).toBe("C#");
    expect(parseMarkdown("## Title ##\n", "x").outline).toEqual(["  Title"]);
  });
});
