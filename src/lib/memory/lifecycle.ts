import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import {
  agents,
  memories,
  memoryAcl,
  memoryAssets,
  memorySources,
  memoryTombstones,
  projectMembers,
} from "@/lib/db/schema";
import { MEMORY_CATEGORIES } from "@/lib/domain/enums";
import { MEMORY_LEVELS, REVIEW_STATUSES } from "@/lib/domain/memory";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import { isSharedContext, loadAsset, requireManage } from "./access";
import { redactDependents, scrubEventTitles } from "./dependents";
import { maybeEnqueueConsolidation } from "./enqueue";
import { contentHash, textTombKey, tombstoneKey } from "./hash";
import { announce, audit, idInput, sharedVisibility, write } from "./ops";
import { addVersion, type MemoryView } from "./store";

// ---- edit -------------------------------------------------------------------------------------

export const editInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(2).max(160),
  content: z.string().trim().min(1).max(4000),
  category: z.enum(MEMORY_CATEGORIES),
  importance: z.enum(["high", "normal"]).default("normal"),
});

/** Takes the id of the *memory* (the payload), as the existing UI does. */
export async function updateMemory(
  actor: Actor,
  slug: string,
  input: unknown,
): Promise<MemoryView> {
  const { id, ...data } = parse(editInput, input);
  return write(actor, slug, async (tx, access) => {
    const [m] = await tx
      .select({ assetId: memories.assetId })
      .from(memories)
      .where(and(eq(memories.id, id), eq(memories.projectId, access.project.id)));
    if (!m) throw new AppError("NOT_FOUND");
    const loaded = await loadAsset(tx, access, m.assetId, { lock: true });
    requireManage(loaded);

    const version = loaded.asset.version + 1;
    // A person edited it: the text is theirs now, and the journal will not overwrite it.
    await tx
      .update(memoryAssets)
      .set({
        title: data.title,
        searchText: `${data.title}\n${data.content}`,
        contentHash: contentHash(data.title, data.content),
        version,
        lastIndexedAt: new Date(),
      })
      .where(eq(memoryAssets.id, loaded.asset.id));
    const [row] = await tx
      .update(memories)
      .set({
        ...data,
        humanEditedAt: new Date(),
        confidence:
          loaded.memory.confidence === "extracted" ? "confirmed" : loaded.memory.confidence,
      })
      .where(eq(memories.id, id))
      .returning();
    await addVersion(tx, {
      assetId: loaded.asset.id,
      version,
      title: data.title,
      content: data.content,
      editedBy: access.actor.id,
      reason: "edit",
    });
    await announce(tx, access, loaded, "memory.updated", loaded.asset, data.title);
    return row;
  });
}

// ---- review -----------------------------------------------------------------------------------

export const approveInput = z.object({
  id: z.uuid(),
  visibility: sharedVisibility.default("project"),
  /** Required when the candidate disagrees with an approved memory. */
  onConflict: z.enum(["supersede", "keep_both"]).optional(),
});

export async function approveMemory(actor: Actor, slug: string, input: unknown): Promise<void> {
  const data = parse(approveInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadAsset(tx, access, data.id, { lock: true });
    requireManage(loaded);
    const { asset, memory } = loaded;
    if (!REVIEW_STATUSES.includes(asset.status as (typeof REVIEW_STATUSES)[number])) {
      throw new AppError("CONFLICT");
    }
    // Private means its owner: someone else approving a proposal cannot make it private to them.
    if (data.visibility === "private" && asset.ownerId !== access.actor.id) {
      throw new AppError("AUTHORIZATION_ERROR");
    }
    // A conflict is surfaced, never settled by code: the reviewer must say what happens to it.
    if (asset.conflictWithId && !data.onConflict) {
      throw new AppError("VALIDATION_ERROR", "conflict_unresolved", { onConflict: "required" });
    }
    if (asset.conflictWithId && data.onConflict === "supersede") {
      // Replacing someone's memory needs the right to change it, not just to approve a new one.
      const retired = await loadAsset(tx, access, asset.conflictWithId, { lock: true });
      requireManage(retired);
      if (retired.asset.status !== "approved") throw new AppError("CONFLICT");
      await tx
        .update(memoryAssets)
        .set({ status: "superseded" })
        .where(eq(memoryAssets.id, retired.asset.id));
      await redactDependents(
        tx,
        { id: retired.asset.id, title: retired.asset.title },
        access.actor.id,
      );
      await scrubEventTitles(tx, access.project.id, retired.memory.id);
      await announce(tx, access, retired, "memory.archived", {
        status: "superseded",
        visibility: retired.asset.visibility,
      });
    }
    await tx
      .update(memoryAssets)
      .set({
        status: "approved",
        visibility: data.visibility,
        supersedesId: data.onConflict === "supersede" ? asset.conflictWithId : null,
        conflictWithId: null,
        validFrom: new Date(),
      })
      .where(eq(memoryAssets.id, asset.id));
    // Grants belong to restricted and agent assets; a leftover must not revive on a later change.
    if (data.visibility === "private" || data.visibility === "project") {
      await tx.delete(memoryAcl).where(eq(memoryAcl.assetId, asset.id));
    }
    // A person confirmed an extracted fact. An inference stays labelled as one.
    if (memory.confidence === "extracted") {
      await tx.update(memories).set({ confidence: "confirmed" }).where(eq(memories.id, memory.id));
    }
    await audit(tx, access, "memory.approved", asset.id, { visibility: data.visibility });
    if (data.visibility === "project" && memory.level === "L1") {
      await maybeEnqueueConsolidation(tx, {
        projectId: access.project.id,
        kind: memory.kind,
        lastAssetId: asset.id,
      });
    }
    await announce(
      tx,
      access,
      loaded,
      "memory.approved",
      { status: "approved", visibility: data.visibility },
      asset.title,
    );
  });
}

export async function rejectMemory(actor: Actor, slug: string, input: unknown): Promise<void> {
  const { id } = parse(idInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadAsset(tx, access, id, { lock: true });
    requireManage(loaded);
    if (!REVIEW_STATUSES.includes(loaded.asset.status as (typeof REVIEW_STATUSES)[number])) {
      throw new AppError("CONFLICT");
    }
    await tx.update(memoryAssets).set({ status: "rejected" }).where(eq(memoryAssets.id, id));
    // A rejected suggestion must not come back the next time the same text is extracted.
    await tx
      .insert(memoryTombstones)
      .values({
        projectId: access.project.id,
        keyHash: tombstoneKey(
          textTombKey(
            loaded.asset.title,
            loaded.memory.content,
            loaded.asset.visibility === "project" ? null : loaded.asset.ownerId,
          ),
        ),
        deletedBy: access.actor.id,
      })
      .onConflictDoNothing();
    await audit(tx, access, "memory.rejected", id);
  });
}

// ---- archive, visibility, sharing -------------------------------------------------------------

export async function archiveMemory(actor: Actor, slug: string, input: unknown): Promise<void> {
  const { id } = parse(idInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadAsset(tx, access, id, { lock: true });
    requireManage(loaded);
    if (loaded.asset.status !== "approved") throw new AppError("CONFLICT");
    await tx.update(memoryAssets).set({ status: "archived" }).where(eq(memoryAssets.id, id));
    await redactDependents(tx, { id, title: loaded.asset.title }, access.actor.id);
    await scrubEventTitles(tx, access.project.id, loaded.memory.id);
    await audit(tx, access, "memory.archived", id);
    await announce(tx, access, loaded, "memory.archived", {
      status: "archived",
      visibility: loaded.asset.visibility,
    });
  });
}

export async function restoreMemory(actor: Actor, slug: string, input: unknown): Promise<void> {
  const { id } = parse(idInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadAsset(tx, access, id, { lock: true });
    requireManage(loaded);
    if (loaded.asset.status !== "archived") throw new AppError("CONFLICT");
    await tx.update(memoryAssets).set({ status: "approved" }).where(eq(memoryAssets.id, id));
    await audit(tx, access, "memory.restored", id);
    await announce(
      tx,
      access,
      loaded,
      "memory.approved",
      { status: "approved", visibility: loaded.asset.visibility },
      loaded.asset.title,
    );
  });
}

// ---- delete -----------------------------------------------------------------------------------

/**
 * Hard delete. The registry row, payload, versions, sources, ACL and bindings go with it (cascade),
 * so no index or cache can still hold the text. What stays is a hash of the key, so automatic
 * ingestion does not bring it back, and an audit entry that names no content.
 */
export async function deleteMemory(actor: Actor, slug: string, input: unknown): Promise<void> {
  const { id } = parse(idInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadAsset(tx, access, id, { lock: true });
    requireManage(loaded);
    const { asset } = loaded;

    const raw = [
      textTombKey(
        asset.title,
        loaded.memory.content,
        asset.visibility === "project" ? null : asset.ownerId,
      ),
      ...(asset.dedupeKey ? [asset.dedupeKey] : []),
    ];
    await tx
      .insert(memoryTombstones)
      .values(
        raw.map((key) => ({
          projectId: access.project.id,
          keyHash: tombstoneKey(key),
          deletedBy: access.actor.id,
        })),
      )
      .onConflictDoNothing();

    // Summaries built from this memory quote it: they lose that line and go back to review.
    await redactDependents(tx, { id, title: asset.title }, access.actor.id);
    await scrubEventTitles(tx, access.project.id, loaded.memory.id);
    await tx
      .update(memoryAssets)
      .set({ conflictWithId: null })
      .where(eq(memoryAssets.conflictWithId, id));
    await tx
      .update(memoryAssets)
      .set({ supersedesId: sql`null` })
      .where(eq(memoryAssets.supersedesId, id));

    await tx.delete(memoryAssets).where(eq(memoryAssets.id, id));
    await audit(tx, access, "memory.deleted", id, { level: loaded.memory.level });
    await announce(tx, access, loaded, "memory.deleted", {
      status: "deleted",
      visibility: asset.visibility,
    });
  });
}

// ---- level ------------------------------------------------------------------------------------

export const levelInput = z.object({ id: z.uuid(), level: z.enum(MEMORY_LEVELS) });

/** "Pin as core": a person promotes a stable fact to L3 (or demotes it). Approved assets only. */
export async function setLevel(actor: Actor, slug: string, input: unknown): Promise<void> {
  const data = parse(levelInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadAsset(tx, access, data.id, { lock: true });
    requireManage(loaded);
    if (loaded.asset.status !== "approved") throw new AppError("CONFLICT");
    await tx.update(memories).set({ level: data.level }).where(eq(memories.id, loaded.memory.id));
    await audit(tx, access, "memory.level_changed", data.id, {
      from: loaded.memory.level,
      to: data.level,
    });
    await announce(tx, access, loaded, "memory.updated", loaded.asset, loaded.asset.title);
  });
}
