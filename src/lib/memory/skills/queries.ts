import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  memoryAssets,
  memoryBindings,
  memorySources,
  memoryVersions,
  skills,
} from "@/lib/db/schema";
import { type AssetStatus, REVIEW_STATUSES } from "@/lib/domain/memory";
import { principalOf } from "../access";
import { canManage } from "../policy";
import { visibleWhere } from "../scope";
import { loadSkill } from "./store";
import { emptyStats, recentUsages, skillStats } from "./usage";

/** Skills of the project the requester may read, in the given statuses. */
export async function listSkills(
  access: ProjectAccess,
  statuses: readonly AssetStatus[] = ["approved"],
  limit = 200,
) {
  const rows = await db
    .select({ asset: memoryAssets, skill: skills })
    .from(memoryAssets)
    .innerJoin(skills, eq(skills.assetId, memoryAssets.id))
    .where(
      and(
        visibleWhere(principalOf(access), access.project.id, statuses),
        eq(memoryAssets.assetType, "skill"),
      ),
    )
    .orderBy(desc(memoryAssets.updatedAt))
    .limit(limit);
  const stats = await skillStats(rows.map((r) => r.asset.id));
  return rows.map((r) => ({ ...r, stats: stats.get(r.asset.id) ?? emptyStats() }));
}

/** Skills waiting for a person: proposals and requests to share. */
export const listSkillReview = (access: ProjectAccess) => listSkills(access, REVIEW_STATUSES, 100);

export async function getSkillDetail(access: ProjectAccess, assetId: string) {
  const loaded = await loadSkill(db, access, assetId);
  const manage = canManage(loaded.principal, loaded.asset, loaded.acl);
  const [versions, sources, bindings, usages, stats] = await Promise.all([
    db
      .select()
      .from(memoryVersions)
      .where(eq(memoryVersions.assetId, assetId))
      .orderBy(desc(memoryVersions.version))
      .limit(50),
    db.select().from(memorySources).where(eq(memorySources.assetId, assetId)),
    manage
      ? db
          .select()
          .from(memoryBindings)
          .where(
            and(
              eq(memoryBindings.assetId, assetId),
              eq(memoryBindings.projectId, access.project.id),
            ),
          )
      : Promise.resolve([]),
    // Notes and who used it are for the people who manage the skill; everyone sees the counts.
    manage ? recentUsages(assetId) : Promise.resolve([]),
    skillStats([assetId]),
  ]);
  return {
    asset: loaded.asset,
    skill: loaded.skill,
    versions,
    sources,
    bindings,
    usages,
    stats: stats.get(assetId) ?? emptyStats(),
    canManage: manage,
    acl: manage ? loaded.acl : [],
  };
}
