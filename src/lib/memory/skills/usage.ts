import "server-only";
import { and, count, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import * as z from "zod";
import type { Actor } from "@/lib/auth/actor";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db, type Executor, type Tx } from "@/lib/db/client";
import { memoryAssets, skillUsages } from "@/lib/db/schema";
import { SKILL_OUTCOMES, type SkillOutcome } from "@/lib/domain/memory";
import { AppError } from "@/lib/errors";
import { scrubSecrets } from "@/lib/secrets/scan";
import { parse } from "@/lib/validation";
import { principalOf } from "../access";
import { write } from "../ops";
import { visibleWhere } from "../scope";
import { loadSkill } from "./store";

const cleanNote = (note: string | undefined) =>
  note ? scrubSecrets(note.trim()).slice(0, 300) || null : null;

/**
 * A skill was put in front of an agent or a person. The outcome comes later. Once per skill, agent
 * and run: planning a run again does not count again.
 */
export async function recordSkillUse(
  tx: Tx,
  input: {
    assetId: string;
    projectId: string;
    skillVersion: number;
    agentId?: string | null;
    userId?: string | null;
    runId?: string | null;
  },
): Promise<string | null> {
  const [row] = await tx
    .insert(skillUsages)
    .values({
      assetId: input.assetId,
      projectId: input.projectId,
      skillVersion: input.skillVersion,
      agentId: input.agentId ?? null,
      userId: input.userId ?? null,
      runId: input.runId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: skillUsages.id });
  if (!row) return null;
  await tx
    .update(memoryAssets)
    .set({ useCount: sql`${memoryAssets.useCount} + 1`, lastAccessedAt: new Date() })
    .where(eq(memoryAssets.id, input.assetId));
  return row.id;
}

/** Skills an agent was shown through a tool call (not a run): at most one use per hour each. */
export async function recordSkillsOffered(
  projectId: string,
  agentId: string,
  hits: { assetId: string; version: number }[],
) {
  for (const h of hits) {
    const [recent] = await db
      .select({ id: skillUsages.id })
      .from(skillUsages)
      .where(
        and(
          eq(skillUsages.assetId, h.assetId),
          eq(skillUsages.agentId, agentId),
          gt(skillUsages.createdAt, new Date(Date.now() - 3_600_000)),
        ),
      )
      .limit(1);
    if (recent) continue;
    await db.transaction((tx) =>
      recordSkillUse(tx, { assetId: h.assetId, projectId, skillVersion: h.version, agentId }),
    );
  }
}

/** A run ended: the skills it carried get its result as their outcome, unless someone already said. */
export async function settleRunUsages(tx: Executor, runId: string, outcome: SkillOutcome) {
  await tx
    .update(skillUsages)
    .set({ outcome, settledBy: "run" })
    .where(and(eq(skillUsages.runId, runId), isNull(skillUsages.outcome)));
}

const feedbackInput = z.object({
  id: z.uuid(),
  outcome: z.enum(SKILL_OUTCOMES),
  note: z.string().max(500).optional(),
});

/** A person says whether a skill worked. */
export async function recordSkillFeedback(actor: Actor, slug: string, input: unknown) {
  const data = parse(feedbackInput, input);
  await write(actor, slug, async (tx, access) => {
    const loaded = await loadSkill(tx, access, data.id);
    if (loaded.asset.status !== "approved") throw new AppError("CONFLICT");
    await tx.insert(skillUsages).values({
      assetId: data.id,
      projectId: access.project.id,
      userId: actor.id,
      skillVersion: loaded.asset.version,
      outcome: data.outcome,
      settledBy: "user",
      note: cleanNote(data.note),
    });
  });
}

const MAX_REPORTS_PER_DAY = 20;

/**
 * An agent reports through MCP. It may only report on a skill it was actually given (a recent use
 * by this agent), the report settles that use, and a reader that never held the skill cannot probe
 * which ids exist or skew its numbers.
 */
export async function recordAgentSkillFeedback(
  access: ProjectAccess,
  agent: { id: string; canReadMemory: boolean },
  input: { skillId: string; outcome: SkillOutcome; note?: string },
) {
  if (!agent.canReadMemory) throw new AppError("AUTHORIZATION_ERROR");
  const [row] = await db
    .select({ id: memoryAssets.id, version: memoryAssets.version })
    .from(memoryAssets)
    .where(
      and(
        visibleWhere(
          { kind: "agent", agentId: agent.id, creatorId: access.actor.id, canReadMemory: true },
          access.project.id,
          ["approved"],
        ),
        eq(memoryAssets.assetType, "skill"),
        eq(memoryAssets.id, input.skillId),
      ),
    );
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [latest] = row
    ? await db
        .select()
        .from(skillUsages)
        .where(
          and(
            eq(skillUsages.assetId, row.id),
            eq(skillUsages.agentId, agent.id),
            gt(skillUsages.createdAt, since),
          ),
        )
        .orderBy(desc(skillUsages.createdAt))
        .limit(1)
    : [];
  if (!row || !latest) throw new AppError("NOT_FOUND", "Unknown skill");
  const note = cleanNote(input.note);
  if (latest.outcome === null) {
    await db
      .update(skillUsages)
      .set({ outcome: input.outcome, note })
      .where(eq(skillUsages.id, latest.id));
    return;
  }
  const [{ today }] = await db
    .select({ today: count() })
    .from(skillUsages)
    .where(
      and(
        eq(skillUsages.assetId, row.id),
        eq(skillUsages.agentId, agent.id),
        gt(skillUsages.createdAt, new Date(Date.now() - 86_400_000)),
      ),
    );
  if (today >= MAX_REPORTS_PER_DAY) throw new AppError("RATE_LIMIT");
  await db.insert(skillUsages).values({
    assetId: row.id,
    projectId: access.project.id,
    agentId: agent.id,
    skillVersion: row.version,
    outcome: input.outcome,
    settledBy: "agent",
    note,
  });
}

export interface SkillStats {
  uses: number;
  /** Reports by a person or the agent that used it. The only numbers about the skill itself. */
  success: number;
  partial: number;
  failure: number;
  /** How the runs that were offered it ended. A run can end well without using the skill. */
  runs: { success: number; failure: number };
}

export const emptyStats = (): SkillStats => ({
  uses: 0,
  success: 0,
  partial: 0,
  failure: 0,
  runs: { success: 0, failure: 0 },
});

/** Real numbers only, and each says who is speaking. Nothing is estimated. */
export async function skillStats(assetIds: string[]): Promise<Map<string, SkillStats>> {
  const out = new Map<string, SkillStats>();
  if (assetIds.length === 0) return out;
  const rows = await db
    .select({
      id: skillUsages.assetId,
      outcome: skillUsages.outcome,
      by: skillUsages.settledBy,
      n: count(),
    })
    .from(skillUsages)
    .where(inArray(skillUsages.assetId, assetIds))
    .groupBy(skillUsages.assetId, skillUsages.outcome, skillUsages.settledBy);
  for (const id of assetIds) out.set(id, emptyStats());
  for (const r of rows) {
    const s = out.get(r.id);
    if (!s) continue;
    s.uses += r.n;
    if (!r.outcome) continue;
    if (r.by === "run") {
      if (r.outcome === "success") s.runs.success += r.n;
      if (r.outcome === "failure") s.runs.failure += r.n;
    } else s[r.outcome] += r.n;
  }
  return out;
}

export async function recentUsages(assetId: string, limit = 20) {
  return db
    .select()
    .from(skillUsages)
    .where(eq(skillUsages.assetId, assetId))
    .orderBy(desc(skillUsages.createdAt))
    .limit(limit);
}
