import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "@/lib/pdf/markdown";

describe("parseInline", () => {
  it("reads bold and italic and drops link targets, code ticks and tags", () => {
    expect(parseInline("a **b** and *c* and __d__ [site](https://x.test) `code` <b>t</b>")).toEqual(
      [
        { text: "a " },
        { text: "b", bold: true },
        { text: " and " },
        { text: "c", italic: true },
        { text: " and " },
        { text: "d", bold: true },
        { text: " site code t" },
      ],
    );
  });

  it("leaves plain text and stray markers alone", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([{ text: "2 * 3 = 6" }]);
    expect(parseInline("")).toEqual([]);
  });
});

describe("parseMarkdown", () => {
  it("reads headings, paragraphs, lists, rules and quotes", () => {
    const blocks = parseMarkdown(
      [
        "# Agreement",
        "",
        "First line",
        "second line.",
        "",
        "## Scope",
        "- one",
        "- **two**",
        "",
        "1. step",
        "2) next",
        "",
        "---",
        "> note",
        "#### deep",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      { type: "heading", level: 1, inlines: [{ text: "Agreement" }] },
      { type: "paragraph", inlines: [{ text: "First line second line." }] },
      { type: "heading", level: 2, inlines: [{ text: "Scope" }] },
      { type: "list", ordered: false, items: [[{ text: "one" }], [{ text: "two", bold: true }]] },
      { type: "list", ordered: true, items: [[{ text: "step" }], [{ text: "next" }]] },
      { type: "rule" },
      { type: "quote", inlines: [{ text: "note" }] },
      { type: "heading", level: 3, inlines: [{ text: "deep" }] },
    ]);
  });

  it("reads a table as rows and skips the divider line", () => {
    expect(parseMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |")).toEqual([
      {
        type: "table",
        rows: [
          ["a", "b"],
          ["1", "2"],
        ],
      },
    ]);
  });

  it("never turns text into anything but text", () => {
    const [block] = parseMarkdown("<script>alert(1)</script> and [x](javascript:alert(1))");
    expect(block).toEqual({ type: "paragraph", inlines: [{ text: "alert(1) and x" }] });
  });
});
