/**
 * Pure rules behind the CI checks, kept apart from the scripts that call git and pnpm so they can
 * be tested without either.
 */

export interface FileCoverage {
  lines: { total: number; covered: number; pct: number };
}
export type CoverageSummary = Record<string, FileCoverage>;

/** Files held to the per-file coverage bar: the code that decides things, not presentation or data. */
export function needsCoverage(path: string): boolean {
  if (!/^src\/(lib|app\/api)\/.+\.ts$/.test(path) && !/^src\/app\/.+\/actions\.ts$/.test(path))
    return false;
  if (path.endsWith(".d.ts")) return false;
  if (/^src\/lib\/(db\/migrations|interview\/copy|domain)\//.test(path)) return false;
  return true;
}

export interface CoverageVerdict {
  failures: { path: string; pct: number }[];
  checked: { path: string; pct: number }[];
}

/**
 * New and changed files must reach `threshold` percent of lines. A file the test run never loaded
 * counts as 0 percent: untested is the thing this exists to catch.
 */
export function evaluateCoverage(
  changed: string[],
  summary: CoverageSummary,
  threshold: number,
): CoverageVerdict {
  const checked: CoverageVerdict["checked"] = [];
  for (const path of changed.filter(needsCoverage)) {
    const entry = summary[path];
    // Files with no executable lines (types only, re-exports) cannot be uncovered.
    if (entry && entry.lines.total === 0) continue;
    checked.push({ path, pct: entry ? entry.lines.pct : 0 });
  }
  return { checked, failures: checked.filter((c) => c.pct < threshold) };
}

/** `pnpm licenses list --json`: licence name to the packages that carry it. */
export type LicenseReport = Record<string, { name: string; versions?: string[] }[]>;

export const ALLOWED_LICENSES = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "MPL-2.0",
  "CC0-1.0",
  "BlueOak-1.0.0",
  "Python-2.0",
  "CC-BY-4.0",
  "Unlicense",
];

/** An SPDX expression such as "(MIT OR Apache-2.0)" passes when every alternative path allows it. */
export function licenseAllowed(expression: string, allowed: string[] = ALLOWED_LICENSES): boolean {
  const parts = expression
    .replace(/[()]/g, " ")
    .split(/\s+(?:OR|AND)\s+|\s+/)
    .map((p) => p.trim())
    .filter((p) => p && p !== "OR" && p !== "AND" && p !== "WITH");
  if (parts.length === 0) return false;
  if (/\bOR\b/.test(expression)) return parts.some((p) => allowed.includes(p));
  return parts.every((p) => allowed.includes(p));
}

/**
 * Packages whose licence is outside the allowlist but approved in an ADR. A trailing `*` matches a
 * prefix (one package per platform). Adding an entry needs an ADR number.
 */
export const APPROVED_EXCEPTIONS: { match: string; adr: string }[] = [
  // Prebuilt libvips used by Next's image optimisation: LGPL, dynamically linked, not modified.
  { match: "@img/sharp-libvips-*", adr: "0002" },
  // GSAP's own licence (free for commercial use). Unused today; remove the dependency, see the ADR.
  { match: "gsap", adr: "0002" },
  // Mermaid's dependencies: khroma ships an MIT licence file but declares none; elkjs is EPL-2.0
  // (file-level copyleft), used unmodified.
  { match: "khroma", adr: "0016" },
  { match: "elkjs", adr: "0016" },
];

const excepted = (name: string, patterns: string[]) =>
  patterns.some((p) => (p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : name === p));

export function evaluateLicenses(
  report: LicenseReport,
  allowed: string[] = ALLOWED_LICENSES,
  /** Packages approved by an ADR despite their licence. */
  exceptions: string[] = [],
): { name: string; license: string }[] {
  return Object.entries(report).flatMap(([license, packages]) =>
    licenseAllowed(license, allowed)
      ? []
      : packages
          .filter((p) => !excepted(p.name, exceptions))
          .map((p) => ({ name: p.name, license })),
  );
}
