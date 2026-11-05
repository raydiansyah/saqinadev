import "server-only";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { activeEmbeddingModelId } from "@/lib/ai/embeddings";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { memoryEmbeddings, projectSettings } from "@/lib/db/schema";
import { SEMANTIC_CONSENT_VERSION } from "@/lib/domain/memory";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import { scheduleMemoryJobs } from "../schedule";
import { enqueueEmbedProject } from "./enqueue";

export const CONSENT_VERSION = SEMANTIC_CONSENT_VERSION;

const input = z.object({ enabled: z.boolean(), consent: z.string().optional() });

/** A project admin turns semantic search on (with consent) or off (which deletes the vectors). */
export async function setSemanticSearch(
  actor: Actor,
  slug: string,
  raw: unknown,
): Promise<{ enabled: boolean }> {
  const data = parse(input, raw);
  const access = await loadProjectAccess(actor, { slug }, "members:manage");
  const projectId = access.project.id;
  if (data.enabled && data.consent !== CONSENT_VERSION)
    throw new AppError("VALIDATION_ERROR", "Consent is required", { consent: "required" });
  if (data.enabled && !(await activeEmbeddingModelId()))
    throw new AppError("VALIDATION_ERROR", "No embedding model", { semantic: "noModel" });
  await db.transaction(async (tx) => {
    await tx
      .insert(projectSettings)
      .values({ projectId, semanticSearchEnabled: data.enabled })
      .onConflictDoUpdate({
        target: projectSettings.projectId,
        set: { semanticSearchEnabled: data.enabled },
      });
    if (!data.enabled)
      await tx.delete(memoryEmbeddings).where(eq(memoryEmbeddings.projectId, projectId));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId,
      type: data.enabled ? "memory.semantic_enabled" : "memory.semantic_disabled",
      entityType: "project",
      entityId: projectId,
      metadata: { consentVersion: data.enabled ? CONSENT_VERSION : null },
    });
  });
  // Run the first reconcile after the response, not at the next cron.
  if (data.enabled && (await enqueueEmbedProject(db, projectId))) scheduleMemoryJobs(projectId);
  return { enabled: data.enabled };
}
