import { sql } from "drizzle-orm";
import { storageDriver } from "@/lib/attachments/storage";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

/**
 * Liveness and database check for uptime monitors. Reveals only whether things work and the
 * deployed commit; never configuration or error details.
 */
export async function GET() {
  const started = Date.now();
  let database = false;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS)),
    ]);
    database = true;
  } catch {
    database = false;
  }
  return Response.json(
    {
      status: database ? "ok" : "degraded",
      database,
      /** Whether chat attachments can be stored (S3, or the database outside production). */
      fileStorage: storageDriver() !== "none",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      latencyMs: Date.now() - started,
    },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
