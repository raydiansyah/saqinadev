import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { withVerifiedSsl } from "./connection-string";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** A transaction handle; repositories accept either so services can compose them atomically. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Tx;

const globalForDb = globalThis as unknown as { saqinaPool?: Pool };

/**
 * Connections one server process may hold. A project page asks for 15 or more things at once, so
 * with a database that is far away (a laptop talking to a hosted one) the ones over the limit wait for
 * a connection and add a whole round trip. Raise it there; keep it small on a serverless host, where
 * every instance holds its own.
 */
function poolMax(): number {
  const n = Number(process.env.DATABASE_POOL_MAX);
  return Number.isInteger(n) && n >= 2 && n <= 50 ? n : 10;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString: withVerifiedSsl(connectionString), max: poolMax() });
}

// One pool per process; dev hot reload would otherwise open a new pool on every edit.
const pool = globalForDb.saqinaPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.saqinaPool = pool;

export const db: Database = drizzle({ client: pool, schema });
