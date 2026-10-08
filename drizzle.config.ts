import { defineConfig } from "drizzle-kit";

// Migrations are generated from the schema and applied with `pnpm db:migrate`.
// `drizzle-kit push` is intentionally not part of the workflow.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./src/lib/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
