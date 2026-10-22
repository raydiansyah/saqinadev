import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { memories, memoryAssets } from "@/lib/db/schema";
import { MEMORY_CATEGORIES, type MemoryCategory, type MemorySource } from "@/lib/domain/enums";
import type {
  AssetStatus,
  MemoryConfidence,
  MemoryKind,
  MemoryLevel,
  Visibility,
} from "@/lib/domain/memory";
import { type Trace, traceMetadata, USER_TRACE } from "@/lib/events/types";
import { parse } from "@/lib/validation";
import { isSharedContext, principalOf } from "./access";
import { notExpired, visibleWhere } from "./scope";
import { insertChatMemory, type MemoryView, type SourceRef } from "./store";

export { updateMemory } from "./lifecycle";
export type { MemoryView } from "./store";

/**
 * Approved memories the requester may read, newest first. Private and unreviewed assets of other
 * people never appear here; the review queue and the detail page have their own queries.
 */
export async function listMemories(
  access: ProjectAccess,
  category?: MemoryCategory,
): Promise<MemoryView[]> {
  const rows = await db
    .select({ memory: memories })
    .from(memories)
    .innerJoin(memoryAssets, eq(memoryAssets.id, memories.assetId))
    .where(
      and(
        visibleWhere(principalOf(access), access.project.id, ["approved"]),
        notExpired(),
        category ? eq(memories.category, category) : undefined,
      ),
    )
    .orderBy(desc(memories.createdAt));
  return rows.map((r) => r.memory);
}

export const memoryFields = {
  title: z.string().trim().min(2).max(160),
  content: z.string().trim().min(1).max(4000),
  category: z.enum(MEMORY_CATEGORIES),
  importance: z.enum(["high", "normal"]).default("normal"),
};
export const createMemoryInput = z.object(memoryFields);
export type CreateMemoryData = z.infer<typeof createMemoryInput>;

const SOURCE_FOR: Record<Trace["via"], MemorySource> = {
  user: "user",
  assistant: "assistant",
  agent: "agent",
};
const CONFIDENCE_FOR: Record<Trace["via"], MemoryConfidence> = {
  user: "confirmed",
  assistant: "extracted",
  agent: "extracted",
};

export interface CreateOptions {
  status?: AssetStatus;
  visibility?: Visibility;
  confidence?: MemoryConfidence;
  level?: MemoryLevel;
  kind?: MemoryKind;
  sources?: SourceRef[];
  conflictWithId?: string | null;
}

/**
 * Creates a memory. By default it is approved and shared with the project (the manual path);
 * extraction and agents pass `status: "pending_review"` so a person decides first.
 */
export async function createMemoryTx(
  tx: Tx,
  access: ProjectAccess,
  data: CreateMemoryData,
  trace: Trace = USER_TRACE,
  options: CreateOptions = {},
): Promise<MemoryView> {
  const { project, actor } = access;
  const row = await insertChatMemory(tx, {
    projectId: project.id,
    ...data,
    source: SOURCE_FOR[trace.via],
    createdBy: actor.id,
    confidence: CONFIDENCE_FOR[trace.via],
    ...options,
  });
  const status = options.status ?? "approved";
  const visibility = options.visibility ?? "project";
  // A private or unreviewed memory is not shared context: no feed entry, no revision bump.
  if (isSharedContext({ status, visibility })) {
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "memory.created",
      entityType: "memory",
      entityId: row.id,
      metadata: { title: row.title, category: row.category, ...traceMetadata(trace) },
    });
  }
  return row;
}

export async function createMemory(
  actor: Actor,
  slug: string,
  input: unknown,
): Promise<MemoryView> {
  const data = parse(createMemoryInput, input);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    return createMemoryTx(tx, access, data);
  });
}
