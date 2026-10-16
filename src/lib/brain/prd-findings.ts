import "server-only";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import * as z from "zod";
import type { PlannedAction } from "@/lib/assistant/actions/types";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { documents, prdFindings, projects, requirements, scopeItems, tasks } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { createProposalTx } from "@/lib/proposals/repository";
import { parse } from "@/lib/validation";
import { checkPrd } from "./prd-check";

export type PrdFindingView = typeof prdFindings.$inferSelect;

/**
 * Brings the stored findings in line with what the project says right now: new disagreements
 * open, ones that are gone resolve by themselves, a dismissed one stays dismissed while it lasts.
 */
export async function reconcilePrdFindings(tx: Tx, projectId: string): Promise<void> {
  const [project] = await tx
    .select({ revision: projects.contextRevision })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return;
  const revision = project.revision;

  const [prd] = await tx
    .select({ content: documents.content })
    .from(documents)
    .where(and(eq(documents.projectId, projectId), eq(documents.slug, "prd")));
  const [reqs, taskRows, scope, existing] = await Promise.all([
    tx.select().from(requirements).where(eq(requirements.projectId, projectId)),
    tx.select().from(tasks).where(eq(tasks.projectId, projectId)),
    tx.select().from(scopeItems).where(eq(scopeItems.projectId, projectId)),
    tx.select().from(prdFindings).where(eq(prdFindings.projectId, projectId)),
  ]);

  const candidates = checkPrd({
    prd: prd?.content ?? null,
    requirements: reqs,
    tasks: taskRows,
    scope,
  });
  const current = new Map(candidates.map((c) => [c.fingerprint, c]));
  const known = new Map(existing.map((f) => [f.fingerprint, f]));
  const now = new Date();

  const fresh = candidates.filter((c) => !known.has(c.fingerprint));
  if (fresh.length > 0)
    await tx.insert(prdFindings).values(
      fresh.map((c) => ({
        projectId,
        fingerprint: c.fingerprint,
        kind: c.kind,
        entityType: c.entityType,
        entityId: c.entityId,
        subject: c.subject,
        openedAtRevision: revision,
        lastSeenRevision: revision,
      })),
    );

  const seenOpen: string[] = [];
  const reopen: string[] = [];
  const resolve: string[] = [];
  for (const f of existing) {
    const present = current.has(f.fingerprint);
    if (present && f.status === "resolved") reopen.push(f.id);
    else if (present) seenOpen.push(f.id);
    else if (f.status !== "resolved") resolve.push(f.id);
  }
  if (seenOpen.length > 0)
    await tx
      .update(prdFindings)
      .set({ lastSeenRevision: revision })
      .where(inArray(prdFindings.id, seenOpen));
  if (reopen.length > 0)
    await tx
      .update(prdFindings)
      .set({
        status: "open",
        resolvedAt: null,
        dismissedAt: null,
        dismissedBy: null,
        proposalId: null,
        openedAtRevision: revision,
        lastSeenRevision: revision,
      })
      .where(inArray(prdFindings.id, reopen));
  if (resolve.length > 0)
    await tx
      .update(prdFindings)
      .set({ status: "resolved", resolvedAt: now })
      .where(inArray(prdFindings.id, resolve));
}

/** Open findings, oldest first. Callers have checked access already. */
export async function listPrdFindings(access: ProjectAccess): Promise<PrdFindingView[]> {
  return db
    .select()
    .from(prdFindings)
    .where(and(eq(prdFindings.projectId, access.project.id), eq(prdFindings.status, "open")))
    .orderBy(asc(prdFindings.openedAtRevision), asc(prdFindings.subject));
}

const ids = z.object({ ids: z.array(z.uuid()).min(1).max(25) });

/** The team does not want to act on these; they stay out of the way until the cause changes. */
export async function dismissPrdFindings(actor: Actor, slug: string, raw: unknown) {
  const { ids: findingIds } = parse(ids, raw);
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    await tx
      .update(prdFindings)
      .set({ status: "dismissed", dismissedAt: new Date(), dismissedBy: actor.id })
      .where(
        and(
          eq(prdFindings.projectId, access.project.id),
          inArray(prdFindings.id, findingIds),
          eq(prdFindings.status, "open"),
        ),
      );
  });
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * One proposal that adds requirements the PRD does not mention yet. Nothing is applied here:
 * the team approves it like any proposal, and the finding closes itself once the PRD says it.
 * Findings that are conflicts or gaps in wording need a person and cannot be proposed.
 */
export async function proposePrdUpdate(actor: Actor, slug: string, raw: unknown) {
  const { ids: findingIds } = parse(ids, raw);
  const batch = new EventBatch();
  const proposalId = await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const found = await tx
      .select()
      .from(prdFindings)
      .where(and(eq(prdFindings.projectId, access.project.id), inArray(prdFindings.id, findingIds)))
      .for("update");
    if (found.length !== new Set(findingIds).size) throw new AppError("NOT_FOUND");
    if (
      found.some((f) => f.status !== "open" || f.kind !== "requirement_not_in_prd" || !f.entityId)
    )
      throw new AppError("VALIDATION_ERROR", undefined, { ids: "prdCheck.notProposable" });
    if (found.some((f) => f.proposalId))
      throw new AppError("CONFLICT", undefined, { ids: "prdCheck.alreadyProposed" });

    const reqRows = await tx
      .select()
      .from(requirements)
      .where(
        and(
          eq(requirements.projectId, access.project.id),
          inArray(
            requirements.id,
            found.map((f) => f.entityId as string),
          ),
          ne(requirements.status, "unknown"),
        ),
      );
    const byId = new Map(reqRows.map((r) => [r.id, r]));
    const actions: PlannedAction[] = found.map((f, i) => {
      const r = byId.get(f.entityId as string);
      if (!r) throw new AppError("NOT_FOUND");
      return {
        type: "APPEND_PRD",
        key: `p${i + 1}`,
        payload: {
          heading: clip(r.title.padEnd(2, "."), 120),
          body: clip(r.description ? r.description : `Requirement (${r.group}): ${r.title}`, 6000),
        },
      };
    });
    const proposal = await createProposalTx(
      tx,
      access,
      {
        type: "prd_check",
        title: "Update the PRD",
        description: `${found.length} confirmed requirement${found.length === 1 ? " is" : "s are"} not in the PRD yet.`,
        actions,
      },
      batch,
    );
    await tx
      .update(prdFindings)
      .set({ proposalId: proposal.id })
      .where(
        inArray(
          prdFindings.id,
          found.map((f) => f.id),
        ),
      );
    return proposal.id;
  });
  batch.flush();
  return { proposalId };
}
