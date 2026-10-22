import "server-only";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import type { Actor } from "@/lib/auth/actor";
import { memoryAcl, memoryAssets, memoryTombstones } from "@/lib/db/schema";
import { REVIEW_STATUSES } from "@/lib/domain/memory";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import { skillTombKey, tombstoneKey } from "../hash";
import { audit, idInput, sharedVisibility, write } from "../ops";
import { evaluateSkill, skillContentSchema } from "./content";
import { contentOf, insertSkill, loadSkill, requireManageSkill, writeSkillVersion } from "./store";

const isAdminRole = (role: string) => role === "owner" || role === "admin";
const REVIEW = REVIEW_STATUSES as readonly string[];

/** A person writes a skill. It starts private and approved: usable by its author, shared by nobody. */
export async function createSkill(actor: Actor, slug: string, input: unknown) {
  const content = parse(skillContentSchema, input);
  return write(actor, slug, async (tx, access) => {
    const evaluation = evaluateSkill(content);
    if (evaluation.issues.includes("contains_secret")) {
      throw new AppError("VALIDATION_ERROR", "contains_secret", { steps: "contains_secret" });
    }
    const { asset } = await insertSkill(tx, access, {
      content,
      ownerId: actor.id,
      createdBy: actor.id,
      visibility: "private",
      status: "approved",
      origin: "manual",
      evaluation: { score: evaluation.score, issues: evaluation.issues },
      source: { sourceType: "manual", sourceId: actor.id },
    });
    await audit(tx, access, "skill.created", asset.id, { origin: "manual" });
    return asset.id;
  });
}

const editInput = skillContentSchema.extend({ id: z.uuid() });

/**
 * Edits create a new version. A skill other people use that is changed by someone who is not an
 * admin goes back to review, so a shared workflow never changes silently.
 */
export async function updateSkill(actor: Actor, slug: string, input: unknown) {
  const { id, ...content } = parse(editInput, input);
  const parsed = skillContentSchema.parse(content);
  return write(actor, slug, async (tx, access) => {
    const loaded = await loadSkill(tx, access, id, { lock: true });
    requireManageSkill(loaded);
    const evaluation = evaluateSkill(parsed);
    if (evaluation.issues.includes("contains_secret")) {
      throw new AppError("VALIDATION_ERROR", "contains_secret", { steps: "contains_secret" });
    }
    // Whatever its status, a skill that is not private and is changed by a non-admin goes to
    // review: an archived one cannot be edited and then restored past the admin.
    const needsReview =
      !isAdminRole(access.role) &&
      loaded.asset.visibility !== "private" &&
      loaded.asset.status !== "rejected";
    const version = await writeSkillVersion(tx, loaded, parsed, actor.id, {
      status: needsReview ? "pending_review" : undefined,
      evaluation: { score: evaluation.score, issues: evaluation.issues },
    });
    await audit(tx, access, "skill.updated", id, { version });
    return version;
  });
}

/** The version the reviewer saw: approving or rejecting anything else is a CONFLICT. */
const approveInput = z.object({
  id: z.uuid(),
  version: z.int().min(1),
  visibility: sharedVisibility.default("private"),
});

/**
 * Approves a candidate or a skill waiting for review. Making a skill available to the project, to
 * chosen people or to agents is a decision for project admins; its author can always keep it private.
 */
export async function approveSkill(actor: Actor, slug: string, input: unknown) {
  const data = parse(approveInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadSkill(tx, access, data.id, { lock: true });
    requireManageSkill(loaded);
    if (!REVIEW.includes(loaded.asset.status)) throw new AppError("CONFLICT");
    if (loaded.asset.version !== data.version) throw new AppError("CONFLICT");
    if (data.visibility === "private") {
      if (loaded.asset.ownerId !== actor.id) throw new AppError("AUTHORIZATION_ERROR");
    } else if (!isAdminRole(access.role)) {
      throw new AppError("AUTHORIZATION_ERROR");
    }
    await tx
      .update(memoryAssets)
      .set({ status: "approved", visibility: data.visibility, validFrom: new Date() })
      .where(eq(memoryAssets.id, data.id));
    // Grants an author added while it waited are not approved with it: an admin grants again.
    await tx.delete(memoryAcl).where(eq(memoryAcl.assetId, data.id));
    await audit(tx, access, "skill.approved", data.id, { visibility: data.visibility });
  });
}

const visibilityInput = z.object({ id: z.uuid(), visibility: sharedVisibility });

/**
 * Changes who can use a skill. An admin does it directly; its author, otherwise, asks: the skill
 * waits for an admin and stays unavailable to everyone else until approved.
 */
export async function setSkillVisibility(actor: Actor, slug: string, input: unknown) {
  const data = parse(visibilityInput, input);
  return write(actor, slug, async (tx, access) => {
    const loaded = await loadSkill(tx, access, data.id, { lock: true });
    requireManageSkill(loaded);
    if (data.visibility === "private" && loaded.asset.ownerId !== actor.id) {
      throw new AppError("AUTHORIZATION_ERROR");
    }
    // Chosen people and agents are an admin's call: there is no review path for such a request.
    if (
      !isAdminRole(access.role) &&
      (data.visibility === "restricted" || data.visibility === "agent")
    ) {
      throw new AppError("AUTHORIZATION_ERROR");
    }
    const needsReview =
      data.visibility !== "private" &&
      !isAdminRole(access.role) &&
      (loaded.asset.status === "approved" || loaded.asset.status === "archived");
    await tx
      .update(memoryAssets)
      .set({
        visibility: data.visibility,
        ...(needsReview ? { status: "pending_review" as const } : {}),
      })
      .where(eq(memoryAssets.id, data.id));
    // Grants belong to one visibility; a change starts from none.
    if (data.visibility !== loaded.asset.visibility) {
      await tx.delete(memoryAcl).where(eq(memoryAcl.assetId, data.id));
    }
    await audit(tx, access, "skill.visibility_changed", data.id, {
      from: loaded.asset.visibility,
      to: data.visibility,
      requested: needsReview,
    });
    return needsReview ? ("requested" as const) : ("changed" as const);
  });
}

/** Only an admin's decision about a shared skill blocks the name for the whole project. */
const tomb = (name: string, projectWide: boolean, ownerId: string | null) =>
  skillTombKey(name, projectWide ? null : ownerId);

export async function rejectSkill(actor: Actor, slug: string, input: unknown) {
  const { id, version } = parse(idInput.extend({ version: z.int().min(1) }), input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadSkill(tx, access, id, { lock: true });
    requireManageSkill(loaded);
    if (!REVIEW.includes(loaded.asset.status)) throw new AppError("CONFLICT");
    if (loaded.asset.version !== version) throw new AppError("CONFLICT");
    await tx.update(memoryAssets).set({ status: "rejected" }).where(eq(memoryAssets.id, id));
    // A proposal that was turned down is not proposed again from the same kind of run.
    await tx
      .insert(memoryTombstones)
      .values({
        projectId: access.project.id,
        keyHash: tombstoneKey(
          tomb(
            loaded.asset.title,
            loaded.asset.visibility === "project" && isAdminRole(access.role),
            loaded.asset.ownerId,
          ),
        ),
        deletedBy: actor.id,
      })
      .onConflictDoNothing();
    await audit(tx, access, "skill.rejected", id);
  });
}

export async function archiveSkill(actor: Actor, slug: string, input: unknown) {
  const { id } = parse(idInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadSkill(tx, access, id, { lock: true });
    requireManageSkill(loaded);
    if (loaded.asset.status !== "approved") throw new AppError("CONFLICT");
    await tx.update(memoryAssets).set({ status: "archived" }).where(eq(memoryAssets.id, id));
    await audit(tx, access, "skill.archived", id);
  });
}

export async function restoreSkill(actor: Actor, slug: string, input: unknown) {
  const { id } = parse(idInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadSkill(tx, access, id, { lock: true });
    requireManageSkill(loaded);
    if (loaded.asset.status !== "archived") throw new AppError("CONFLICT");
    // A shared skill comes back through review unless an admin restores it.
    const back = !isAdminRole(access.role) && loaded.asset.visibility !== "private";
    await tx
      .update(memoryAssets)
      .set({ status: back ? "pending_review" : "approved" })
      .where(eq(memoryAssets.id, id));
    await audit(tx, access, "skill.restored", id, { review: back });
  });
}

/** Hard delete: workflow, versions, usage history, grants and bindings go with it. */
export async function deleteSkill(actor: Actor, slug: string, input: unknown) {
  const { id } = parse(idInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadSkill(tx, access, id, { lock: true });
    requireManageSkill(loaded);
    await tx
      .insert(memoryTombstones)
      .values({
        projectId: access.project.id,
        keyHash: tombstoneKey(
          tomb(
            loaded.asset.title,
            loaded.asset.visibility === "project" && isAdminRole(access.role),
            loaded.asset.ownerId,
          ),
        ),
        deletedBy: actor.id,
      })
      .onConflictDoNothing();
    await tx.delete(memoryAssets).where(and(eq(memoryAssets.id, id)));
    await audit(tx, access, "skill.deleted", id);
  });
}

export { contentOf };
