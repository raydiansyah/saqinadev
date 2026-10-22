import "server-only";
import { and, eq } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import type { Executor, Tx } from "@/lib/db/client";
import type { SkillEvaluation } from "@/lib/db/schema";
import { memoryAcl, memoryAssets, memorySources, skills } from "@/lib/db/schema";
import type { AssetStatus, SkillOrigin, SourceType, Visibility } from "@/lib/domain/memory";
import { AppError } from "@/lib/errors";
import { principalOf } from "../access";
import { contentHash } from "../hash";
import { type AclGrant, canManage, canRead, type Principal } from "../policy";
import { addVersion } from "../store";
import { type SkillContent, skillSearchText, skillVersionText } from "./content";

export type SkillRow = typeof skills.$inferSelect;
export type SkillAsset = typeof memoryAssets.$inferSelect;

export interface LoadedSkill {
  asset: SkillAsset;
  skill: SkillRow;
  acl: AclGrant[];
  principal: Principal;
}

/** One skill of the project for the requester. Unreadable is as unknown as missing (NOT_FOUND). */
export async function loadSkill(
  executor: Executor,
  access: ProjectAccess,
  assetId: string,
  options: { lock?: boolean } = {},
): Promise<LoadedSkill> {
  const principal = principalOf(access);
  const query = executor
    .select({ asset: memoryAssets, skill: skills })
    .from(memoryAssets)
    .innerJoin(skills, eq(skills.assetId, memoryAssets.id))
    .where(and(eq(memoryAssets.id, assetId), eq(memoryAssets.projectId, access.project.id)));
  const [row] = await (options.lock ? query.for("update", { of: memoryAssets }) : query);
  if (!row) throw new AppError("NOT_FOUND");
  const acl = await executor.select().from(memoryAcl).where(eq(memoryAcl.assetId, assetId));
  if (!canRead(principal, row.asset, acl)) throw new AppError("NOT_FOUND");
  return { ...row, acl, principal };
}

export function requireManageSkill(l: LoadedSkill): void {
  if (!canManage(l.principal, l.asset, l.acl)) throw new AppError("AUTHORIZATION_ERROR");
}

export const contentOf = (s: SkillRow, asset: SkillAsset): SkillContent => ({
  name: asset.title,
  description: asset.summary ?? "",
  useCase: s.useCase,
  triggers: s.triggers,
  exclusions: s.exclusions,
  prerequisites: s.prerequisites,
  steps: s.steps,
  outputs: s.outputs,
  validation: s.validation,
  resources: s.resources,
});

const payload = (c: SkillContent) => ({
  useCase: c.useCase,
  triggers: c.triggers,
  exclusions: c.exclusions,
  prerequisites: c.prerequisites,
  steps: c.steps,
  outputs: c.outputs,
  validation: c.validation,
  resources: c.resources,
});

export interface NewSkill {
  content: SkillContent;
  ownerId: string | null;
  createdBy: string | null;
  visibility: Visibility;
  status: AssetStatus;
  origin: SkillOrigin;
  originRef?: string | null;
  evaluation?: SkillEvaluation | null;
  source: { sourceType: SourceType; sourceId: string; locator?: Record<string, string | number> };
}

/** Registry row, workflow, first version and source, together. */
export async function insertSkill(tx: Tx, access: ProjectAccess, input: NewSkill) {
  const { content } = input;
  const [asset] = await tx
    .insert(memoryAssets)
    .values({
      assetType: "skill",
      organizationId: access.project.organizationId,
      projectId: access.project.id,
      ownerId: input.ownerId,
      visibility: input.visibility,
      status: input.status,
      title: content.name,
      summary: content.description,
      searchText: skillSearchText(content),
      contentHash: contentHash(content.name, skillVersionText(content)),
      lastIndexedAt: new Date(),
    })
    .returning();
  const [skill] = await tx
    .insert(skills)
    .values({
      assetId: asset.id,
      projectId: access.project.id,
      ...payload(content),
      origin: input.origin,
      originRef: input.originRef ?? null,
      evaluation: input.evaluation ?? null,
    })
    .returning();
  await addVersion(tx, {
    assetId: asset.id,
    version: 1,
    title: content.name,
    content: skillVersionText(content),
    editedBy: input.createdBy,
    reason: "created",
  });
  await tx.insert(memorySources).values({
    assetId: asset.id,
    sourceType: input.source.sourceType,
    sourceId: input.source.sourceId,
    locator: input.source.locator ?? null,
  });
  return { asset, skill };
}

/** A new saved version: the workflow, the registry row and the history move together. */
export async function writeSkillVersion(
  tx: Tx,
  loaded: LoadedSkill,
  content: SkillContent,
  editedBy: string,
  extra: { status?: AssetStatus; evaluation?: SkillEvaluation | null } = {},
) {
  const version = loaded.asset.version + 1;
  await tx
    .update(memoryAssets)
    .set({
      title: content.name,
      summary: content.description,
      searchText: skillSearchText(content),
      contentHash: contentHash(content.name, skillVersionText(content)),
      version,
      lastIndexedAt: new Date(),
      ...(extra.status ? { status: extra.status } : {}),
    })
    .where(eq(memoryAssets.id, loaded.asset.id));
  await tx
    .update(skills)
    .set({
      ...payload(content),
      ...(extra.evaluation !== undefined ? { evaluation: extra.evaluation } : {}),
    })
    .where(eq(skills.id, loaded.skill.id));
  await addVersion(tx, {
    assetId: loaded.asset.id,
    version,
    title: content.name,
    content: skillVersionText(content),
    editedBy,
    reason: "edit",
  });
  return version;
}
