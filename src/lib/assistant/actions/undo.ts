import "server-only";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import type { ProjectAccess } from "@/lib/auth/permissions";
import type { Tx } from "@/lib/db/client";
import { documents, documentVersions, requirements, tasks } from "@/lib/db/schema";
import { saveDocumentTx } from "@/lib/documents/service";
import type { Trace } from "@/lib/events/types";
import {
  deleteRequirementTx,
  type UpdateRequirementData,
  updateRequirementTx,
} from "@/lib/requirements/service";
import { deleteTaskTx, type UpdateTaskData, updateTaskTx } from "@/lib/tasks/service";
import type { ActionType } from "./types";

/**
 * The undo ledger. While the executor applies a plan it records, per change, what is needed to
 * reverse it: the "before" and "after" of a record, or the document versions on either side.
 * A rewind walks the ledger newest first. A change that reached beyond the database (an
 * invoice, a client reminder, an agent run) is recorded as irreversible, and a rewind that
 * would cross one refuses instead of pretending.
 */

const taskFields = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.string(),
  status: z.string(),
});
const requirementFields = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.string(),
  status: z.string(),
});

export const undoStep = z.discriminatedUnion("op", [
  z.object({ op: z.literal("task.created"), id: z.uuid(), after: taskFields }),
  z.object({
    op: z.literal("task.updated"),
    id: z.uuid(),
    before: taskFields,
    after: taskFields,
  }),
  z.object({ op: z.literal("requirement.created"), id: z.uuid(), after: requirementFields }),
  z.object({
    op: z.literal("requirement.updated"),
    id: z.uuid(),
    before: requirementFields,
    after: requirementFields,
  }),
  z.object({
    op: z.literal("document.edited"),
    slug: z.string().max(64),
    title: z.string().max(200),
    fromVersion: z.int().min(1),
    toVersion: z.int().min(1),
  }),
  z.object({
    op: z.literal("irreversible"),
    action: z.string().max(40),
    label: z.string().max(200),
  }),
]);
export type UndoStep = z.infer<typeof undoStep>;

export const undoSteps = z.array(undoStep);

/** Why a rewind cannot cross a change. */
export type BlockerReason = "irreversible" | "changed" | "missing";

export interface Blocker {
  /** Action or record kind, e.g. `CREATE_INVOICE` or `task`. */
  kind: string;
  label: string;
  reason: BlockerReason;
}

const pick = <T extends z.infer<typeof taskFields>>(row: T): z.infer<typeof taskFields> => ({
  title: row.title,
  description: row.description,
  priority: row.priority,
  status: row.status,
});

export const taskSnapshot = pick;
export const requirementSnapshot = pick;

export async function readTaskFields(tx: Tx, projectId: string, id: string) {
  const [row] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.projectId, projectId)));
  return row ? pick(row) : null;
}

export async function readRequirementFields(tx: Tx, projectId: string, id: string) {
  const [row] = await tx
    .select()
    .from(requirements)
    .where(and(eq(requirements.id, id), eq(requirements.projectId, projectId)));
  return row ? pick(row) : null;
}

/** Actions that leave the database or cannot be put back exactly as they were. */
const IRREVERSIBLE: ReadonlySet<ActionType> = new Set([
  "DELETE_TASK",
  "CREATE_MEMORY",
  "CREATE_DECISION",
  "CREATE_HANDOFF",
  "RUN_TOOL",
  "SET_PAYMENT_SCHEDULE",
  "CREATE_INVOICE",
  "CREATE_SCOPE_ITEM",
  "CREATE_CHANGE_REQUEST",
  "GENERATE_DOCUMENT",
  "SEND_CLIENT_REMINDER",
  "ASSIGN_AGENT",
]);

export const isIrreversible = (type: ActionType) => IRREVERSIBLE.has(type);

export function irreversibleStep(type: ActionType, label: string): UndoStep {
  return { op: "irreversible", action: type, label: label.slice(0, 200) };
}

const same = (a: Record<string, string>, b: Record<string, string>) =>
  Object.keys(a).every((key) => a[key] === b[key]);

/**
 * Reverses one step inside the caller's transaction. Returns a blocker when the step cannot be
 * reversed safely (someone changed the record since, or it was never reversible); the caller
 * decides whether to roll back. Nothing is overwritten that a person edited after the assistant.
 */
export async function revertStep(
  tx: Tx,
  access: ProjectAccess,
  step: UndoStep,
  trace: Trace,
): Promise<Blocker | null> {
  const projectId = access.project.id;
  switch (step.op) {
    case "irreversible":
      return { kind: step.action, label: step.label, reason: "irreversible" };
    case "task.created": {
      const current = await readTaskFields(tx, projectId, step.id);
      if (!current) return null; // already gone: nothing left to undo
      if (!same(step.after, current))
        return { kind: "task", label: step.after.title, reason: "changed" };
      await deleteTaskTx(tx, access, step.id, trace);
      return null;
    }
    case "task.updated": {
      const current = await readTaskFields(tx, projectId, step.id);
      if (!current) return { kind: "task", label: step.after.title, reason: "missing" };
      if (!same(step.after, current))
        return { kind: "task", label: current.title, reason: "changed" };
      await updateTaskTx(tx, access, { id: step.id, ...step.before } as UpdateTaskData, trace);
      return null;
    }
    case "requirement.created": {
      const current = await readRequirementFields(tx, projectId, step.id);
      if (!current) return null;
      if (!same(step.after, current))
        return { kind: "requirement", label: step.after.title, reason: "changed" };
      await deleteRequirementTx(tx, access, step.id, trace);
      return null;
    }
    case "requirement.updated": {
      const current = await readRequirementFields(tx, projectId, step.id);
      if (!current) return { kind: "requirement", label: step.after.title, reason: "missing" };
      if (!same(step.after, current))
        return { kind: "requirement", label: current.title, reason: "changed" };
      await updateRequirementTx(
        tx,
        access,
        { id: step.id, ...step.before } as UpdateRequirementData,
        trace,
      );
      return null;
    }
    case "document.edited": {
      const [doc] = await tx
        .select({ id: documents.id, version: documents.version })
        .from(documents)
        .where(and(eq(documents.projectId, projectId), eq(documents.slug, step.slug)));
      if (!doc) return { kind: "document", label: step.title, reason: "missing" };
      if (doc.version !== step.toVersion)
        return { kind: "document", label: step.title, reason: "changed" };
      const [previous] = await tx
        .select({ content: documentVersions.content })
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.documentId, doc.id),
            eq(documentVersions.version, step.fromVersion),
          ),
        );
      if (!previous) return { kind: "document", label: step.title, reason: "missing" };
      // The old text comes back as a new version, so the history keeps both.
      await saveDocumentTx(tx, access, {
        docSlug: step.slug,
        content: previous.content,
        baseVersion: step.toVersion,
        source: "assistant",
        trace,
      });
      return null;
    }
  }
}
