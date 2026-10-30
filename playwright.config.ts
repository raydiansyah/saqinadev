import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests of the Studio. They need their own database (`DATABASE_URL_E2E`, whose name
 * must contain `_e2e`: the seed empties it), a local git checkout and the dev AI mock, which the
 * config starts. See docs/standards/testing.md.
 */
const PORT = 3100;
const AI_PORT = 4101;
const database = process.env.DATABASE_URL_E2E ?? "";

if (!database.includes("_e2e"))
  throw new Error("Set DATABASE_URL_E2E to a database whose name contains _e2e (it is emptied).");

const env = {
  DATABASE_URL: database,
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234",
  BETTER_AUTH_URL: `http://localhost:${PORT}`,
  SAQINA_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  ALLOW_LOCAL_GIT: "1",
  ALLOW_LOCAL_ENDPOINTS: "1",
  CRON_SECRET: "e2e-cron-secret",
  PLATFORM_OWNER_EMAILS: "owner@example.test",
  DEV_AI_SERVER_PORT: String(AI_PORT),
  DEV_AI_DELAY_MS: "2500",
  E2E_AI_PORT: String(AI_PORT),
};

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "pnpm tsx scripts/dev-ai-server.ts",
      url: `http://127.0.0.1:${AI_PORT}/v1/models`,
      // The mock wants its key even for the health check; any answer means it is up.
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      env,
      timeout: 30_000,
      stdout: "ignore",
    },
    {
      command: `pnpm next dev -p ${PORT}`,
      url: `http://localhost:${PORT}/en/sign-in`,
      reuseExistingServer: !process.env.CI,
      env,
      timeout: 180_000,
      stdout: "ignore",
    },
  ],
});
