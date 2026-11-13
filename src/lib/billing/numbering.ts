import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import { orgCounters } from "@/lib/db/schema";

/**
 * Next sequence number for an organization, kind and year. The upsert takes a row lock, so two
 * concurrent callers never get the same number.
 */
export async function nextSequence(
  tx: Tx,
  organizationId: string,
  kind: "invoice" | "receipt",
  year: number,
): Promise<number> {
  const [row] = await tx
    .insert(orgCounters)
    .values({ organizationId, kind, year, next: 2 })
    .onConflictDoUpdate({
      target: [orgCounters.organizationId, orgCounters.kind, orgCounters.year],
      set: { next: sql`${orgCounters.next} + 1` },
    })
    .returning({ next: orgCounters.next });
  return row.next - 1;
}
