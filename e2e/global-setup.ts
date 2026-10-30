import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** Migrates and seeds the end-to-end database, then hands the project's details to the specs. */
export default function setup() {
  const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL_E2E,
    BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234",
    BETTER_AUTH_URL: "http://localhost:3100",
    SAQINA_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    ALLOW_LOCAL_ENDPOINTS: "1",
    ALLOW_LOCAL_GIT: "1",
    E2E_AI_PORT: "4101",
    // `server-only` is a marker for the bundler; outside Next it has to resolve to nothing.
    NODE_OPTIONS: "--conditions=react-server",
  };
  execFileSync("pnpm", ["tsx", "scripts/migrate.ts"], { env, stdio: "ignore" });
  const out = execFileSync("pnpm", ["tsx", "e2e/seed.ts"], { env, encoding: "utf8" });
  const line = out
    .trim()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .pop();
  if (!line) throw new Error("The seed printed no project details");
  writeFileSync(join(__dirname, ".seed.json"), line);
}
