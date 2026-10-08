import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Applies pending migrations. Never drops data; schema changes go through generated SQL. */
async function main() {
  const url = process.argv.includes("--test")
    ? process.env.DATABASE_URL_TEST
    : process.env.DATABASE_URL;
  if (!url) throw new Error("Database URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "./src/lib/db/migrations" });
  await pool.end();
  console.log(`Migrations applied to ${new URL(url).pathname.slice(1)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
