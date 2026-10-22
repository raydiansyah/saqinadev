import "server-only";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { memories, memoryAssets, memorySources, skills } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";
import { principalOf } from "../access";
import { notExpired, visibleWhere } from "../scope";
import { contentOf } from "../skills/store";
import {
  checksumOf,
  EXPORT_PART_ITEMS,
  MAX_EXPORT_ITEMS,
  type MemoryPackage,
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  type PackageItem,
} from "./package";

/** Source kinds whose reference points at a record of this project (a document, a decision, a file path), not at a private chat. */
const PORTABLE_SOURCES = new Set(["document", "decision", "repo_file"]);

/**
 * What the requester can read, as a package: approved memories and skills, including their own
 * private ones, never anyone else's. Message and conversation ids are left out (they point into
 * private chats); sources that are names (a document, a decision, a file path) stay.
 */
export async function exportMemoryPackage(
  actor: Actor,
  slug: string,
  options: { part?: number } = {},
): Promise<MemoryPackage> {
  const access = await loadProjectAccess(actor, { slug }, "project:read");
  if (!(await allow(`memory-export:${actor.id}`, 10, 3_600_000))) throw new AppError("RATE_LIMIT");
  const scope = and(
    visibleWhere(principalOf(access), access.project.id, ["approved"]),
    notExpired(),
  );

  const chat = await db
    .select({ asset: memoryAssets, memory: memories })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(and(scope, eq(memoryAssets.assetType, "chat")))
    .orderBy(desc(memoryAssets.updatedAt))
    .limit(MAX_EXPORT_ITEMS);
  const sources = chat.length
    ? await db
        .select()
        .from(memorySources)
        .where(
          inArray(
            memorySources.assetId,
            chat.map((c) => c.asset.id),
          ),
        )
    : [];

  const skillRows = await db
    .select({ asset: memoryAssets, skill: skills })
    .from(memoryAssets)
    .innerJoin(skills, eq(skills.assetId, memoryAssets.id))
    .where(and(scope, eq(memoryAssets.assetType, "skill")))
    .orderBy(desc(memoryAssets.updatedAt))
    .limit(MAX_EXPORT_ITEMS);

  const all: PackageItem[] = [
    ...chat.map(({ asset, memory }) => ({
      type: "memory" as const,
      title: asset.title,
      content: memory.content,
      category: memory.category,
      importance: memory.importance,
      level: memory.level,
      kind: memory.kind,
      origin: memory.source,
      sources: sources
        .filter((s) => s.assetId === asset.id && PORTABLE_SOURCES.has(s.sourceType))
        .map((s) => ({ type: s.sourceType, ref: s.sourceId })),
      createdAt: asset.createdAt.toISOString(),
    })),
    ...skillRows.map(({ asset, skill }) => ({
      type: "skill" as const,
      ...contentOf(skill, asset),
    })),
  ].slice(0, MAX_EXPORT_ITEMS);
  // One file holds one part, so it can be imported again in one go (a person imports part by part).
  const parts = Math.max(1, Math.ceil(all.length / EXPORT_PART_ITEMS));
  const number = Math.min(Math.max(options.part ?? 1, 1), parts);
  const items = all.slice((number - 1) * EXPORT_PART_ITEMS, number * EXPORT_PART_ITEMS);

  await recordAudit(db, {
    actorId: actor.id,
    scope: "project",
    projectId: access.project.id,
    type: "memory.exported",
    entityType: "project",
    entityId: access.project.id,
    metadata: { memories: chat.length, skills: skillRows.length, part: number },
  });
  return {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    project: { name: access.project.name },
    items,
    ...(parts > 1 ? { part: { number, of: parts } } : {}),
    checksum: checksumOf(items),
  };
}

/** How many files an export of what the person can read comes to. Counts only; nothing is exported. */
export async function countExportParts(
  actor: Actor,
  slug: string,
): Promise<{ items: number; parts: number }> {
  const access = await loadProjectAccess(actor, { slug }, "project:read");
  const [row] = await db
    .select({ n: count() })
    .from(memoryAssets)
    .where(
      and(
        visibleWhere(principalOf(access), access.project.id, ["approved"]),
        notExpired(),
        inArray(memoryAssets.assetType, ["chat", "skill"]),
      ),
    );
  const items = Math.min(row?.n ?? 0, MAX_EXPORT_ITEMS);
  return { items, parts: Math.max(1, Math.ceil(items / EXPORT_PART_ITEMS)) };
}
