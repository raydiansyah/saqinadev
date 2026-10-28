import "server-only";
import { and, asc, count, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { runAi } from "@/lib/ai/gateway";
import type { AiProvider } from "@/lib/ai/provider";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Executor } from "@/lib/db/client";
import {
  conversations,
  memories,
  memoryAssets,
  memoryJobs,
  memorySources,
  messages,
  users,
} from "@/lib/db/schema";
import type { MemoryCategory } from "@/lib/domain/enums";
import { type JobKind, MEMORY_KINDS, type MemoryKind } from "@/lib/domain/memory";
import { AppError, isAppError } from "@/lib/errors";
import type { SyncAdapter } from "@/lib/git/types";
import { log } from "@/lib/log";
import { principalOf } from "./access";
import { runCodeIndex } from "./code/indexer";
import { CATEGORY_FOR, CONSOLIDATE_AFTER, runConsolidation, uncitedFacts } from "./consolidate";
import { lastExtractedMessageId } from "./enqueue";
import { extractCandidates } from "./extract/extractor";
import {
  type Candidate,
  CONFLICT_OVERLAP,
  jaccard,
  MAX_PENDING_PER_OWNER,
  selectWindow,
} from "./extract/plan";
import { contentHash, textTombKeys } from "./hash";
import { enqueue } from "./queue";
import { accessFor } from "./runas";
import { visibleWhere } from "./scope";
import { runSkillExtraction } from "./skills/extract";
import { insertChatMemory, isTombstoned } from "./store";
import { syncWikiFromDocuments } from "./wiki/index";

// Longer than any model call, so a slow job is not taken over while it still runs.
const LOCK_MS = 10 * 60_000;
type Job = typeof memoryJobs.$inferSelect;

// ---- run --------------------------------------------------------------------------------------

/** Claims due jobs (or ones whose worker died) and runs them. Safe to call from many places. */
export async function processMemoryJobs(
  options: { limit?: number; provider?: AiProvider; codeAdapter?: SyncAdapter } = {},
): Promise<{ ready: number; failed: number }> {
  // A job whose worker died too many times is finished, not retried for ever.
  await db
    .update(memoryJobs)
    .set({ status: "failed_permanent", lockedUntil: null, errorCode: "stalled" })
    .where(
      and(
        eq(memoryJobs.status, "processing"),
        lt(memoryJobs.lockedUntil, sql`now()`),
        sql`${memoryJobs.attempts} >= ${memoryJobs.maxAttempts}`,
      ),
    );
  const claimed = await db.execute<Job>(sql`
    update memory_jobs set status = 'processing', attempts = attempts + 1,
      locked_until = now() + ${`${LOCK_MS / 1000} seconds`}::interval, updated_at = now()
    where id in (
      select id from memory_jobs
      where (status in ('queued', 'failed_retryable') and run_after <= now())
         or (status = 'processing' and locked_until < now())
      order by run_after limit ${options.limit ?? 5}
      for update skip locked
    ) returning id, project_id as "projectId", kind, attempts, max_attempts as "maxAttempts", input`);

  let ready = 0;
  let failed = 0;
  for (const job of claimed.rows) {
    try {
      const outcome =
        job.kind === "extract_chat" ? await runExtraction(job, options.provider) : "done";
      if (job.kind === "consolidate") await runConsolidation(job);
      if (job.kind === "index_wiki") {
        // A document that could not be read is retried (bounded), not forgotten in a log line.
        const sync = await syncWikiFromDocuments(job.projectId);
        if (sync.failed > 0) throw new AppError("INTERNAL_ERROR");
      }
      if (job.kind === "extract_skill") await runSkillExtraction(job, options.provider);
      if (job.kind === "index_code") await runCodeIndex(job, { adapter: options.codeAdapter });
      await db
        .update(memoryJobs)
        .set(
          outcome === "skipped"
            ? { status: "cancelled", lockedUntil: null, errorCode: "review_backlog" }
            : { status: "ready", lockedUntil: null, errorCode: null },
        )
        .where(eq(memoryJobs.id, job.id));
      ready++;
    } catch (error) {
      failed++;
      // A code only: the message could quote conversation text.
      const code = isAppError(error) ? error.code : "job_failed";
      const permanent =
        job.attempts >= job.maxAttempts || (isAppError(error) && error.code === "NOT_FOUND");
      log.warn("memory.job.failed", {
        jobId: job.id,
        kind: job.kind,
        attempts: job.attempts,
        code,
      });
      await db
        .update(memoryJobs)
        .set({
          status: permanent ? "failed_permanent" : "failed_retryable",
          lockedUntil: null,
          errorCode: code,
          // 2, 4, 8… minutes: a provider outage is not hammered.
          runAfter: new Date(Date.now() + 2 ** job.attempts * 60_000),
        })
        .where(eq(memoryJobs.id, job.id));
    }
  }
  return { ready, failed };
}

async function runExtraction(job: Job, provider?: AiProvider): Promise<"done" | "skipped"> {
  const conversationId = String(job.input.conversationId);
  const toMessageId = String(job.input.toMessageId);
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.projectId, job.projectId)));
  if (!conversation) throw new AppError("NOT_FOUND");
  const access = await accessFor(job.projectId, conversation.userId);

  const rows = await db
    .select({ id: messages.id, role: messages.role, content: messages.content })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.status, "completed"),
        isNull(messages.rewoundAt),
      ),
    )
    .orderBy(asc(messages.createdAt));
  const upTo = rows.findIndex((r) => r.id === toMessageId);
  const cursor = await lastExtractedMessageId(db, conversationId);
  const window = selectWindow(
    rows.slice(0, upTo + 1).map((r) => ({
      id: r.id,
      role: r.role === "user" ? ("user" as const) : ("assistant" as const),
      content: r.content,
    })),
    cursor,
  );
  if (window.length === 0) return "done";

  const [{ pending }] = await db
    .select({ pending: count() })
    .from(memoryAssets)
    .where(
      and(
        eq(memoryAssets.projectId, job.projectId),
        eq(memoryAssets.ownerId, conversation.userId),
        eq(memoryAssets.status, "pending_review"),
      ),
    );
  // Too much already waits for this person. The window is not marked read: it is taken up later.
  if (pending >= MAX_PENDING_PER_OWNER) return "skipped";

  const outcome = await runAi({
    access,
    operation: "structured_analysis",
    required: ["structured_output"],
    override: provider,
    run: (client) => extractCandidates(client, window),
  });
  await db.transaction(async (tx) => {
    for (const candidate of outcome.value) {
      await storeCandidate(tx, access, candidate, conversationId);
    }
    // Candidates and cursor move together: a crash re-reads the window, never skips it.
    await tx
      .update(conversations)
      .set({ memoryCursor: toMessageId })
      .where(eq(conversations.id, conversationId));
  });
  return "done";
}

async function storeCandidate(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  access: ProjectAccess,
  c: Candidate,
  conversationId: string,
) {
  const projectId = access.project.id;
  const hash = contentHash(c.title, c.content);
  // Rejected or deleted before: it stays out. Same text already present: nothing new to review.
  if (await isTombstoned(tx, projectId, ...textTombKeys(c.title, c.content, access.actor.id))) {
    return;
  }
  const [dup] = await tx
    .select({ id: memoryAssets.id })
    .from(memoryAssets)
    .where(
      and(
        eq(memoryAssets.projectId, projectId),
        eq(memoryAssets.contentHash, hash),
        // Someone else's private text is not a reason to drop mine, or to reveal that it exists.
        or(eq(memoryAssets.ownerId, access.actor.id), eq(memoryAssets.visibility, "project")),
      ),
    )
    .limit(1);
  if (dup) return;

  const conflictWithId = await findConflict(tx, access, c);
  await insertChatMemory(tx, {
    projectId,
    title: c.title,
    content: c.content,
    category: CATEGORY_FOR[c.kind],
    source: "assistant",
    createdBy: access.actor.id,
    // The conversation is private to its owner, so what comes out of it starts private too.
    ownerId: access.actor.id,
    visibility: "private",
    status: "pending_review",
    kind: c.kind,
    level: "L1",
    confidence: c.basis === "explicit" ? "extracted" : "inferred",
    conflictWithId,
    sources: c.sourceMessageIds.map((id) => ({
      sourceType: "message" as const,
      sourceId: id,
      locator: { conversationId },
    })),
  });
}

/** An approved memory of the same kind that says something close but different: a reviewer decides. */
async function findConflict(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  access: ProjectAccess,
  c: Candidate,
): Promise<string | null> {
  const rows = await tx
    .select({
      id: memoryAssets.id,
      title: memoryAssets.title,
      content: memories.content,
      hash: memoryAssets.contentHash,
    })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(
      and(
        visibleWhere(principalOf(access), access.project.id, ["approved"]),
        eq(memories.kind, c.kind),
      ),
    )
    .limit(200);
  const mine = contentHash(c.title, c.content);
  let best: { id: string; score: number } | null = null;
  for (const r of rows) {
    if (r.hash === mine) continue;
    const score = jaccard(`${c.title} ${c.content}`, `${r.title} ${r.content}`);
    if (score >= CONFLICT_OVERLAP && (!best || score > best.score)) best = { id: r.id, score };
  }
  return best?.id ?? null;
}

// ---- retry ------------------------------------------------------------------------------------

/** A project admin puts a permanently failed job back in the queue. */
export async function retryJob(actor: Actor, slug: string, jobId: string): Promise<void> {
  const access = await loadProjectAccess(actor, { slug }, "members:manage");
  const updated = await db
    .update(memoryJobs)
    .set({
      status: "queued",
      attempts: 0,
      runAfter: new Date(),
      errorCode: null,
      lockedUntil: null,
    })
    .where(
      and(
        eq(memoryJobs.id, jobId),
        eq(memoryJobs.projectId, access.project.id),
        inArray(memoryJobs.status, ["failed_permanent", "failed_retryable", "cancelled"]),
      ),
    )
    .returning({ id: memoryJobs.id });
  if (updated.length === 0) throw new AppError("NOT_FOUND");
}

export { maybeEnqueueConsolidation, maybeEnqueueExtraction } from "./enqueue";
