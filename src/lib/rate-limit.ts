import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { log } from "@/lib/log";

/**
 * Fixed-window limiter backed by Postgres, so the budget is shared by every serverless
 * instance. One atomic upsert per check. Fails open: if the database cannot be reached the
 * request is allowed, because the same outage would already fail the real work behind it.
 */
export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const result = await db.execute<{ count: number }>(sql`
      insert into rate_limits (key, count, window_start)
      values (${key}, 1, now())
      on conflict (key) do update set
        count = case
          when rate_limits.window_start + (${windowMs} * interval '1 millisecond') <= now()
            then 1 else rate_limits.count + 1 end,
        window_start = case
          when rate_limits.window_start + (${windowMs} * interval '1 millisecond') <= now()
            then now() else rate_limits.window_start end
      returning count
    `);
    return Number(result.rows[0]?.count ?? 1) <= limit;
  } catch (error) {
    log.warn("rate_limit.unavailable", { error: String(error) });
    return true;
  }
}
