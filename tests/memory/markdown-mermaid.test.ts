import { describe, expect, it } from "vitest";
import { isMermaidClass, mermaidSource } from "@/lib/markdown/mermaid";

describe("mermaid blocks in Markdown", () => {
  it("recognises only a block whose language is mermaid", () => {
    expect(isMermaidClass("language-mermaid")).toBe(true);
    expect(isMermaidClass(["foo", "language-mermaid"])).toBe(true);
    expect(isMermaidClass("language-mermaidx")).toBe(false);
    expect(isMermaidClass("language-ts")).toBe(false);
    expect(isMermaidClass(undefined)).toBe(false);
  });

  it("takes the diagram text without the trailing newline", () => {
    expect(mermaidSource("graph TD\n  A-->B\n")).toBe("graph TD\n  A-->B");
    expect(mermaidSource(["graph TD\n", "  A-->B\n"])).toBe("graph TD\n  A-->B");
    expect(mermaidSource(undefined)).toBe("");
  });
});
