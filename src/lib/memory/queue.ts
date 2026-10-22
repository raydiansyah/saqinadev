import "server-only";
import type { Executor } from "@/lib/db/client";
import { memoryJobs } from "@/lib/db/schema";
import type { JobKind } from "@/lib/domain/memory";

/** Idempotent: asking twice for the same conversation state queues one job. */
export async function enqueue(
  executor: Executor,
  input: { projectId: string; kind: JobKind; key: string; data: Record<string, string | number> },
): Promise<boolean> {
  const rows = await executor
    .insert(memoryJobs)
    .values({
      projectId: input.projectId,
      kind: input.kind,
      idempotencyKey: input.key,
      input: input.data,
    })
    .onConflictDoNothing()
    .returning({ id: memoryJobs.id });
  return rows.length > 0;
}
