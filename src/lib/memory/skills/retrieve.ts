import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { memoryAssets, memoryBindings, skills } from "@/lib/db/schema";
import { log } from "@/lib/log";
import type { Principal } from "../policy";
import { tsQuery } from "../retrieval/fts";
import { notExpired, visibleWhere } from "../scope";
import { renderSkill, type SkillContent } from "./content";
import { contentOf } from "./store";

export interface SkillHit {
  assetId: string;
  version: number;
  content: SkillContent;
  /** The skill as an agent reads it. */
  text: string;
  score: number;
}

const readable = (principal: Principal, projectId: string) =>
  and(
    visibleWhere(principal, projectId, ["approved"]),
    eq(memoryAssets.assetType, "skill"),
    notExpired(),
  );

async function hydrate(principal: Principal, projectId: string, ids: string[]) {
  if (ids.length === 0) return [];
  // Read again under the access filter: a binding or a ranking never decides who may read.
  return db
    .select({ asset: memoryAssets, skill: skills })
    .from(memoryAssets)
    .innerJoin(skills, eq(skills.assetId, memoryAssets.id))
    .where(and(readable(principal, projectId), inArray(memoryAssets.id, ids)));
}

const toHit = (r: Awaited<ReturnType<typeof hydrate>>[number], score: number): SkillHit => {
  const content = contentOf(r.skill, r.asset);
  return {
    assetId: r.asset.id,
    version: r.asset.version,
    content,
    text: renderSkill(content),
    score,
  };
};

/**
 * Approved skills the requester may use that fit a task, best first. Full-text only; the caller
 * (a model or a person) still judges the triggers and exclusions that come with each skill.
 * Never throws: a failure is an empty list, and agents simply start without skills.
 */
export async function retrieveSkills(
  principal: Principal,
  projectId: string,
  options: { query: string; limit?: number },
): Promise<SkillHit[]> {
  const query = options.query.trim().slice(0, 500);
  if (!query) return [];
  try {
    const tsq = tsQuery(query);
    const found = await db
      .select({ id: memoryAssets.id, rank: sql<number>`ts_rank(${memoryAssets.search}, ${tsq})` })
      .from(memoryAssets)
      .where(and(readable(principal, projectId), sql`${memoryAssets.search} @@ ${tsq}`))
      .orderBy(desc(sql`ts_rank(${memoryAssets.search}, ${tsq})`))
      .limit(Math.min(options.limit ?? 5, 10));
    const rank = new Map(found.map((f) => [f.id, f.rank]));
    const rows = await hydrate(
      principal,
      projectId,
      found.map((f) => f.id),
    );
    return rows.map((r) => toHit(r, rank.get(r.asset.id) ?? 0)).sort((a, b) => b.score - a.score);
  } catch (error) {
    log.warn("skills.retrieval_failed", {
      projectId,
      error: error instanceof Error ? error.name : "error",
    });
    return [];
  }
}

/** Skills bound to an agent (or its role): what it starts with, still filtered by access. */
export async function resolveSkillLoadout(
  principal: Principal,
  projectId: string,
  target: { type: "agent" | "agent_role" | "assistant"; id: string },
  options: { taskType?: string } = {},
): Promise<SkillHit[]> {
  try {
    const bindings = await db
      .select({ assetId: memoryBindings.assetId, priority: memoryBindings.priority })
      .from(memoryBindings)
      .where(
        and(
          eq(memoryBindings.projectId, projectId),
          eq(memoryBindings.targetType, target.type),
          eq(memoryBindings.targetId, target.id),
          eq(memoryBindings.enabled, true),
          eq(memoryBindings.mode, "always"),
          sql`${memoryBindings.assetId} is not null`,
          options.taskType
            ? or(
                isNull(memoryBindings.taskTypes),
                sql`${options.taskType} = any(${memoryBindings.taskTypes})`,
              )
            : isNull(memoryBindings.taskTypes),
        ),
      )
      .orderBy(desc(memoryBindings.priority))
      .limit(20);
    const priority = new Map(
      bindings.flatMap((b) => (b.assetId ? [[b.assetId, b.priority] as const] : [])),
    );
    const rows = await hydrate(principal, projectId, [...priority.keys()]);
    return rows
      .map((r) => toHit(r, priority.get(r.asset.id) ?? 0))
      .sort((a, b) => b.score - a.score);
  } catch (error) {
    log.warn("skills.loadout_failed", {
      projectId,
      error: error instanceof Error ? error.name : "error",
    });
    return [];
  }
}
