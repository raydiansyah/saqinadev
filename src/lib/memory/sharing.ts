import "server-only";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import type { Actor } from "@/lib/auth/actor";
import { agents, memoryAcl, memoryAssets, projectMembers } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import {
  isSharedContext,
  loadAnyAsset,
  loadAsset,
  requireManage,
  requireManageBase,
} from "./access";
import { redactDependents, scrubEventTitles } from "./dependents";
import { announce, audit, sharedVisibility, write } from "./ops";

export const visibilityInput = z.object({ id: z.uuid(), visibility: sharedVisibility });

export async function changeVisibility(actor: Actor, slug: string, input: unknown): Promise<void> {
  const data = parse(visibilityInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadAsset(tx, access, data.id, { lock: true });
    requireManage(loaded);
    // Someone else's memory cannot be pulled into private by an admin: private means its owner.
    if (data.visibility === "private" && loaded.asset.ownerId !== access.actor.id) {
      throw new AppError("AUTHORIZATION_ERROR");
    }
    await tx
      .update(memoryAssets)
      .set({ visibility: data.visibility })
      .where(eq(memoryAssets.id, data.id));
    // Access lists belong to restricted and agent assets only; leaving that scope drops them.
    if (data.visibility === "private" || data.visibility === "project") {
      await tx.delete(memoryAcl).where(eq(memoryAcl.assetId, data.id));
    }
    await audit(tx, access, "memory.visibility_changed", data.id, {
      from: loaded.asset.visibility,
      to: data.visibility,
    });
    // Leaving the shared context: summaries that quote it and the feed titles go too.
    if (isSharedContext(loaded.asset) && data.visibility !== "project") {
      await redactDependents(
        tx,
        { id: loaded.asset.id, title: loaded.asset.title },
        access.actor.id,
      );
      await scrubEventTitles(tx, access.project.id, loaded.memory.id);
    }
    const after = { status: loaded.asset.status, visibility: data.visibility };
    await announce(
      tx,
      access,
      loaded,
      isSharedContext(after) ? "memory.approved" : "memory.unshared",
      after,
      isSharedContext(after) ? loaded.asset.title : undefined,
    );
  });
}

export const shareInput = z.object({
  id: z.uuid(),
  principalType: z.enum(["user", "agent"]),
  principalId: z.string().min(1).max(64),
  permission: z.enum(["read", "manage"]).default("read"),
});

export async function shareMemory(actor: Actor, slug: string, input: unknown): Promise<void> {
  const data = parse(shareInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadAnyAsset(tx, access, data.id, { lock: true });
    requireManageBase(loaded);
    if (loaded.asset.visibility !== "restricted" && loaded.asset.visibility !== "agent") {
      throw new AppError("VALIDATION_ERROR", "visibility_not_restricted");
    }
    // The principal must belong to this project: a grant never reaches outside it.
    const [valid] =
      data.principalType === "user"
        ? await tx
            .select({ id: projectMembers.userId })
            .from(projectMembers)
            .where(
              and(
                eq(projectMembers.projectId, access.project.id),
                eq(projectMembers.userId, data.principalId),
              ),
            )
        : await tx
            .select({ id: agents.id })
            .from(agents)
            .where(and(eq(agents.projectId, access.project.id), eq(agents.id, data.principalId)));
    if (!valid) throw new AppError("NOT_FOUND");
    await tx
      .insert(memoryAcl)
      .values({ assetId: data.id, ...data, grantedBy: access.actor.id })
      .onConflictDoUpdate({
        target: [memoryAcl.assetId, memoryAcl.principalType, memoryAcl.principalId],
        set: { permission: data.permission },
      });
    await audit(tx, access, "memory.shared", data.id, {
      principalType: data.principalType,
      permission: data.permission,
    });
  });
}

export async function revokeShare(actor: Actor, slug: string, input: unknown): Promise<void> {
  const data = parse(shareInput.omit({ permission: true }), input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadAnyAsset(tx, access, data.id, { lock: true });
    requireManageBase(loaded);
    await tx
      .delete(memoryAcl)
      .where(
        and(
          eq(memoryAcl.assetId, data.id),
          eq(memoryAcl.principalType, data.principalType),
          eq(memoryAcl.principalId, data.principalId),
        ),
      );
    await audit(tx, access, "memory.share_revoked", data.id, { principalType: data.principalType });
  });
}
