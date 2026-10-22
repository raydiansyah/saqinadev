import "server-only";
import { z } from "zod";
import { recordActivity } from "@/lib/activity/service";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { isSharedContext, type LoadedAsset } from "./access";

export const idInput = z.object({ id: z.uuid() });
// "organization" exists in the vocabulary but has no meaning for a project asset yet.
export const sharedVisibility = z.enum(["private", "project", "restricted", "agent"]);

export async function write<T>(
  actor: Actor,
  slug: string,
  fn: (tx: Tx, access: ProjectAccess) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    return fn(tx, access);
  });
}

export const audit = (tx: Tx, access: ProjectAccess, type: string, assetId: string, extra = {}) =>
  recordAudit(tx, {
    actorId: access.actor.id,
    scope: "project",
    projectId: access.project.id,
    type,
    entityType: "memory_asset",
    entityId: assetId,
    metadata: extra,
  });

/** Feed entry only when the change touches what the whole project reads. */
export async function announce(
  tx: Tx,
  access: ProjectAccess,
  loaded: LoadedAsset,
  type:
    | "memory.updated"
    | "memory.approved"
    | "memory.archived"
    | "memory.deleted"
    | "memory.unshared",
  after: { status: string; visibility: string },
  title?: string,
) {
  if (!isSharedContext(loaded.asset) && !isSharedContext(after)) return;
  await recordActivity(tx, {
    projectId: access.project.id,
    actorId: access.actor.id,
    type,
    entityType: "memory",
    entityId: loaded.memory.id,
    metadata: title ? { title } : {},
  });
}
