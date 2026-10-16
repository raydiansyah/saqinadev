import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../src/app/globals.css"), "utf8");

describe("memory graph motion", () => {
  it("only applies its animations when the visitor has not asked for reduced motion", () => {
    const block =
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.graph-enter[\s\S]*?\n\}\n/.exec(
        css,
      )?.[0];
    expect(block).toBeDefined();
    for (const cls of [".graph-enter", ".graph-edge-enter", ".graph-pulse"])
      expect(block).toContain(cls);
    // Outside that block nothing animates these classes, so reduced motion shows the final picture.
    const outside = css.replace(block ?? "", "");
    expect(outside).not.toMatch(/\.graph-(enter|edge-enter|pulse)\s*\{/);
  });
});
