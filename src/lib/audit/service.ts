import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";
import { scrubValue } from "@/lib/secrets/scan";

type Meta = Record<string, string | number | boolean | null>;

/** Infrastructure audit trail. Metadata is scrubbed so no secret can land here by mistake. */
export async function recordAudit(
  executor: Executor,
  input: {
    actorId: string | null;
    scope: "platform" | "project";
    projectId?: string | null;
    type: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Meta;
  },
): Promise<void> {
  await executor.insert(auditEvents).values({
    actorId: input.actorId,
    scope: input.scope,
    projectId: input.projectId ?? null,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: scrubValue(input.metadata ?? {}) as Meta,
  });
}

export async function listAudit(
  scope: "platform" | "project",
  projectId: string | null,
  limit = 50,
) {
  return db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.scope, scope),
        projectId ? eq(auditEvents.projectId, projectId) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}
