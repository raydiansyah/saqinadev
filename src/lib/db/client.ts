import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** A transaction handle; repositories accept either so services can compose them atomically. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Tx;

const globalForDb = globalThis as unknown as { saqinaPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString, max: 10 });
}

// One pool per process; dev hot reload would otherwise open a new pool on every edit.
const pool = globalForDb.saqinaPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.saqinaPool = pool;

export const db: Database = drizzle(pool, { schema });
