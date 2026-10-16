/**
 * Fails when a production dependency carries a licence outside the allowlist in
 * docs/standards/delivery.md. A package approved by an ADR is listed in LICENSE_EXCEPTIONS.
 *
 *   pnpm check:licenses
 */
import { execFileSync } from "node:child_process";
import { APPROVED_EXCEPTIONS, evaluateLicenses, type LicenseReport } from "./lib-rules";

const EXCEPTIONS = [
  ...APPROVED_EXCEPTIONS.map((e) => e.match),
  ...(process.env.LICENSE_EXCEPTIONS ?? "").split(",").filter(Boolean),
];

const report = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
) as LicenseReport;

const total = Object.values(report).reduce((n, list) => n + list.length, 0);
const bad = evaluateLicenses(report, undefined, EXCEPTIONS);
console.log(`${total} production packages, ${Object.keys(report).length} licences.`);
if (bad.length > 0) {
  console.error("\nLicences outside the allowlist (needs an ADR):");
  for (const b of bad) console.error(`  ${b.license}  ${b.name}`);
  process.exit(1);
}
console.log("All licences are allowed.");
