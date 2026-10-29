import { describe, expect, it } from "vitest";
import { enhanceDeterministic, renderPrd, splitPrd } from "@/lib/prd/brief";

describe("PRD as a form", () => {
  const md =
    "# Shop PRD\n\n_Draft note._\n\n## 1. Overview\n\nA shop.\n\n## 2. Goals\n\n- Sell\n\n```md\n## not a heading\n```\n";

  it("splits title and numbered sections, ignoring headings inside code", () => {
    const brief = splitPrd(md, "Fallback");
    expect(brief.title).toBe("Shop PRD");
    expect(brief.sections.map((s) => s.heading)).toEqual(["Overview", "Goals"]);
    expect(brief.sections[1].body).toContain("## not a heading");
  });

  it("keeps text with no sections as an overview", () => {
    expect(splitPrd("Just some notes", "Fallback")).toEqual({
      title: "Fallback",
      sections: [{ heading: "Overview", body: "Just some notes" }],
    });
  });

  it("renders back with numbered sections and drops empty ones", () => {
    const out = renderPrd({
      title: "T",
      sections: [
        { heading: "1. A", body: "a" },
        { heading: "Empty", body: "  " },
        { heading: "B", body: "b" },
      ],
    });
    expect(out).toBe("# T\n\n## 1. A\n\na\n\n## 2. B\n\nb\n");
  });

  it("round-trips a rendered PRD", () => {
    const brief = splitPrd(md, "x");
    expect(splitPrd(renderPrd(brief), "x")).toEqual(brief);
  });
});

describe("rules-only Enhance", () => {
  it("turns loose lines into a list and drops repeats", () => {
    expect(enhanceDeterministic("Pay by card\nPay by card\nRefunds within 7 days")).toBe(
      "- Pay by card\n- Refunds within 7 days",
    );
  });

  it("leaves structured text alone apart from spacing", () => {
    expect(enhanceDeterministic("- a\n\n\n\n- b")).toBe("- a\n\n- b");
    expect(enhanceDeterministic("One paragraph only.")).toBe("One paragraph only.");
  });
});
