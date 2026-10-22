import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { Executor, Tx } from "@/lib/db/client";
import {
  memories,
  memoryAssets,
  memorySources,
  memoryTombstones,
  memoryVersions,
  projects,
} from "@/lib/db/schema";
import type { MemoryCategory, MemorySource } from "@/lib/domain/enums";
import type {
  AssetStatus,
  MemoryConfidence,
  MemoryKind,
  MemoryLevel,
  SourceType,
  Visibility,
} from "@/lib/domain/memory";
import { AppError } from "@/lib/errors";
import { contentHash, tombstoneKey } from "./hash";

export type MemoryView = typeof memories.$inferSelect;

export interface SourceRef {
  sourceType: SourceType;
  sourceId: string;
  locator?: Record<string, string | number>;
}

export interface ChatMemoryInput {
  projectId: string;
  /** Already known by the caller (a bulk import resolves it once). */
  organizationId?: string;
  title: string;
  content: string;
  category: MemoryCategory;
  importance?: "high" | "normal";
  source: MemorySource;
  /** Person who wrote or triggered it; the owner of the asset unless `ownerId` says otherwise. */
  createdBy: string | null;
  ownerId?: string | null;
  visibility?: Visibility;
  status?: AssetStatus;
  level?: MemoryLevel;
  kind?: MemoryKind;
  confidence?: MemoryConfidence;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
  conflictWithId?: string | null;
  sources?: SourceRef[];
}

/** What a category usually means as a kind; extraction may say otherwise. */
export function kindForCategory(category: MemoryCategory): MemoryKind {
  if (category === "decision") return "decision";
  if (category === "constraint") return "constraint";
  if (category === "user_preference") return "preference";
  return "fact";
}

const searchTextOf = (title: string, content: string) => `${title}\n${content}`;

async function organizationOf(tx: Tx, projectId: string): Promise<string> {
  const [row] = await tx
    .select({ organizationId: projects.organizationId })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!row) throw new AppError("NOT_FOUND");
  return row.organizationId;
}

export async function addVersion(
  tx: Tx,
  v: {
    assetId: string;
    version: number;
    title: string;
    content: string;
    editedBy: string | null;
    reason?: string;
  },
): Promise<void> {
  await tx.insert(memoryVersions).values({ ...v, reason: v.reason ?? null });
}

/** True when a person deleted or rejected this identity; automatic writers must not bring it back. */
export async function isTombstoned(
  tx: Executor,
  projectId: string,
  ...keys: string[]
): Promise<boolean> {
  const [row] = await tx
    .select({ id: memoryTombstones.id })
    .from(memoryTombstones)
    .where(
      and(
        eq(memoryTombstones.projectId, projectId),
        inArray(
          memoryTombstones.keyHash,
          keys.map((k) => tombstoneKey(k)),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Creates the registry row, the chat payload, version 1 and the sources in one go. */
export async function insertChatMemory(tx: Tx, input: ChatMemoryInput): Promise<MemoryView> {
  const organizationId = input.organizationId ?? (await organizationOf(tx, input.projectId));
  const [asset] = await tx
    .insert(memoryAssets)
    .values({
      assetType: "chat",
      organizationId,
      projectId: input.projectId,
      ownerId: input.ownerId === undefined ? input.createdBy : input.ownerId,
      visibility: input.visibility ?? "project",
      status: input.status ?? "approved",
      title: input.title,
      searchText: searchTextOf(input.title, input.content),
      contentHash: contentHash(input.title, input.content),
      dedupeKey: input.dedupeKey ?? null,
      conflictWithId: input.conflictWithId ?? null,
      lastIndexedAt: new Date(),
    })
    .returning({ id: memoryAssets.id });

  const [row] = await tx
    .insert(memories)
    .values({
      projectId: input.projectId,
      assetId: asset.id,
      title: input.title,
      content: input.content,
      category: input.category,
      importance: input.importance ?? "normal",
      source: input.source,
      createdBy: input.createdBy,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      level: input.level ?? "L1",
      kind: input.kind ?? kindForCategory(input.category),
      confidence: input.confidence ?? "confirmed",
    })
    .returning();

  await addVersion(tx, {
    assetId: asset.id,
    version: 1,
    title: input.title,
    content: input.content,
    editedBy: input.createdBy,
    reason: "created",
  });
  const sources = input.sources?.length
    ? input.sources
    : [{ sourceType: "manual" as const, sourceId: row.id }];
  await tx
    .insert(memorySources)
    .values(sources.map((s) => ({ assetId: asset.id, ...s, locator: s.locator ?? null })));
  return row;
}

export type KeyedResult = "created" | "updated" | "kept";

/**
 * Writes a keyed fact (the journal, imported docs): the same key updates in place, a person's
 * edit is never overwritten, identical text writes nothing, and a deleted key stays deleted.
 */
export async function upsertKeyedMemory(
  tx: Tx,
  entry: Omit<ChatMemoryInput, "dedupeKey" | "createdBy" | "status" | "visibility"> & {
    dedupeKey: string;
  },
): Promise<{ result: KeyedResult; memoryId: string | null }> {
  if (await isTombstoned(tx, entry.projectId, entry.dedupeKey)) {
    return { result: "kept", memoryId: null };
  }
  const [existing] = await tx
    .select({ memory: memories, asset: memoryAssets })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(
      and(eq(memoryAssets.projectId, entry.projectId), eq(memoryAssets.dedupeKey, entry.dedupeKey)),
    );

  if (!existing) {
    const row = await insertChatMemory(tx, {
      ...entry,
      createdBy: null,
      ownerId: null,
      visibility: "project",
      status: "approved",
      confidence: entry.confidence ?? "derived",
    });
    return { result: "created", memoryId: row.id };
  }
  const hash = contentHash(entry.title, entry.content);
  const sameText =
    existing.asset.contentHash === hash &&
    existing.memory.importance === (entry.importance ?? "normal") &&
    existing.memory.category === entry.category;
  if (existing.memory.humanEditedAt || sameText)
    return { result: "kept", memoryId: existing.memory.id };

  const version = existing.asset.version + 1;
  await tx
    .update(memoryAssets)
    .set({
      title: entry.title,
      searchText: searchTextOf(entry.title, entry.content),
      contentHash: hash,
      version,
      lastIndexedAt: new Date(),
    })
    .where(eq(memoryAssets.id, existing.asset.id));
  await tx
    .update(memories)
    .set({
      title: entry.title,
      content: entry.content,
      category: entry.category,
      importance: entry.importance ?? "normal",
      entityId: entry.entityId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(memories.id, existing.memory.id));
  await addVersion(tx, {
    assetId: existing.asset.id,
    version,
    title: entry.title,
    content: entry.content,
    editedBy: null,
    reason: "journal",
  });
  return { result: "updated", memoryId: existing.memory.id };
}
