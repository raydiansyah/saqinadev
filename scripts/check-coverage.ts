/**
 * New and changed code must be tested: every changed file under src/lib, src/app/api and the
 * server actions must reach 85 percent of lines. Run after `pnpm test:coverage`.
 *
 *   BASE_REF=origin/main pnpm check:coverage
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { type CoverageSummary, evaluateCoverage } from "./lib-rules";

const THRESHOLD = Number(process.env.COVERAGE_MIN ?? 85);
const base = process.env.BASE_REF ?? "origin/main";
const root = process.cwd();

const changed = execFileSync(
  "git",
  ["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

const raw = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8")) as CoverageSummary;
// The report keys files by absolute path; the rules work on repository-relative paths.
const summary: CoverageSummary = Object.fromEntries(
  Object.entries(raw).map(([file, value]) => [relative(root, resolve(file)), value]),
);

const { checked, failures } = evaluateCoverage(changed, summary, THRESHOLD);
for (const c of checked)
  console.log(
    `${c.pct >= THRESHOLD ? "ok  " : "FAIL"} ${c.pct.toFixed(1).padStart(5)}%  ${c.path}`,
  );
if (checked.length === 0) console.log("No changed files that need coverage.");
if (failures.length > 0) {
  console.error(`\n${failures.length} changed file(s) below ${THRESHOLD}% line coverage.`);
  process.exit(1);
}
