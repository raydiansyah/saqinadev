import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPROVED_EXCEPTIONS,
  evaluateCoverage,
  evaluateLicenses,
  licenseAllowed,
  needsCoverage,
} from "../../scripts/lib-rules";

const cov = (pct: number, total = 10) => ({
  lines: { total, covered: Math.round((total * pct) / 100), pct },
});

describe("needsCoverage", () => {
  it("holds decision code to the bar, not presentation or data", () => {
    for (const p of [
      "src/lib/projects/service.ts",
      "src/lib/meetings/verify.ts",
      "src/app/api/health/route.ts",
      "src/app/[locale]/(app)/dashboard/settings/actions.ts",
    ])
      expect(needsCoverage(p), p).toBe(true);
    for (const p of [
      "src/components/memory/memory-feed.tsx",
      "src/lib/db/migrations/0013_x.ts",
      "src/lib/interview/copy/en.ts",
      "src/lib/domain/enums.ts",
      "src/app/[locale]/(app)/dashboard/page.tsx",
      "src/types.d.ts",
      "messages/app.en.json",
    ])
      expect(needsCoverage(p), p).toBe(false);
  });
});

describe("evaluateCoverage", () => {
  const summary = {
    "src/lib/a/service.ts": cov(92),
    "src/lib/b/service.ts": cov(40),
    "src/lib/c/types.ts": cov(0, 0),
  };

  it("fails files under the bar and passes the rest", () => {
    const v = evaluateCoverage(["src/lib/a/service.ts", "src/lib/b/service.ts"], summary, 85);
    expect(v.failures.map((f) => f.path)).toEqual(["src/lib/b/service.ts"]);
    expect(v.checked).toHaveLength(2);
  });

  it("counts a changed file the tests never loaded as untested", () => {
    const v = evaluateCoverage(["src/lib/new/service.ts"], summary, 85);
    expect(v.failures).toEqual([{ path: "src/lib/new/service.ts", pct: 0 }]);
  });

  it("ignores files with no executable lines and files outside the rule", () => {
    const v = evaluateCoverage(
      ["src/lib/c/types.ts", "src/components/x.tsx", "README.md"],
      summary,
      85,
    );
    expect(v.checked).toEqual([]);
    expect(v.failures).toEqual([]);
  });
});

describe("licenses", () => {
  it("allows permissive licences and SPDX alternatives that include one", () => {
    expect(licenseAllowed("MIT")).toBe(true);
    expect(licenseAllowed("(MIT OR GPL-3.0-only)")).toBe(true);
    expect(licenseAllowed("Apache-2.0 AND MIT")).toBe(true);
  });

  it("refuses copyleft, unknown and combined-with-copyleft licences", () => {
    expect(licenseAllowed("GPL-3.0-only")).toBe(false);
    expect(licenseAllowed("AGPL-3.0-or-later")).toBe(false);
    expect(licenseAllowed("Unknown")).toBe(false);
    expect(licenseAllowed("MIT AND GPL-3.0-only")).toBe(false);
    expect(licenseAllowed("")).toBe(false);
  });

  it("reports the packages behind a refused licence unless an ADR approved them", () => {
    const report = {
      MIT: [{ name: "ok" }],
      "GPL-3.0-only": [{ name: "bad" }, { name: "approved" }],
    };
    expect(evaluateLicenses(report)).toEqual([
      { name: "bad", license: "GPL-3.0-only" },
      { name: "approved", license: "GPL-3.0-only" },
    ]);
    expect(evaluateLicenses(report, undefined, ["approved"])).toEqual([
      { name: "bad", license: "GPL-3.0-only" },
    ]);
  });
});

describe("approved licence exceptions", () => {
  it("match by name or by prefix, and every one points at an ADR that exists", () => {
    const report = {
      "LGPL-3.0-or-later": [{ name: "@img/sharp-libvips-linux-x64" }, { name: "other-lgpl" }],
    };
    const patterns = APPROVED_EXCEPTIONS.map((e) => e.match);
    expect(evaluateLicenses(report, undefined, patterns)).toEqual([
      { name: "other-lgpl", license: "LGPL-3.0-or-later" },
    ]);
    for (const e of APPROVED_EXCEPTIONS)
      expect(
        readdirSync(resolve(__dirname, "../../docs/adr")).some((f) => f.startsWith(`${e.adr}-`)),
        e.adr,
      ).toBe(true);
  });
});

describe("pipeline definition", () => {
  const ci = readFileSync(resolve(__dirname, "../../.github/workflows/ci.yml"), "utf8");

  it("runs every gate the standards name, in order", () => {
    const order = ["pnpm lint", "pnpm typecheck", "pnpm test", "pnpm build"].map((s) =>
      ci.indexOf(s),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const gate of ["gitleaks", "pnpm audit --prod", "pnpm check:licenses", "semgrep"])
      expect(ci, gate).toContain(gate);
  });

  it("never puts a real secret in the workflow", () => {
    expect(ci).not.toMatch(/(sk-|ghp_|gho_|AKIA)[A-Za-z0-9]{10,}/);
  });
});
