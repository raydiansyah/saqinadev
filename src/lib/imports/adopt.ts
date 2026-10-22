import "server-only";
import { and, eq, like } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import { documents, milestones, tasks } from "@/lib/db/schema";
import { parseProvenance, stripProvenance } from "@/lib/docsync/paths";
import { removeWikiSources } from "@/lib/memory/wiki/index";
import { type DocRole, mapDocs } from "./map-docs";
import type { RepoDoc } from "./repo-reader";
import { parseTasks } from "./tasks";

/**
 * Makes an imported repository's PRD, plan and task list the project's own PRD, PLAN and tasks.
 * The copied files stay where the import put them (`repo-*`); this only promotes the right ones.
 * Nothing a person wrote is replaced: a generated PRD is swapped out only while it is still at
 * version 1, i.e. untouched since it was generated.
 */

/** adopted: moved in now. already: it was the project's own already. kept: a person's edits stay. */
export type Adopted = "adopted" | "already" | "kept" | "none";
export interface AdoptResult {
  prd: Adopted;
  plan: Adopted;
  tasks: number;
}

interface Row {
  id: string;
  slug: string;
  content: string;
}

const TARGET = {
  prd: { slug: "prd", type: "prd" as const, title: "PRD" },
  plan: { slug: "plan", type: "plan" as const, title: "PLAN" },
};

/** Moves an imported file into the PRD or PLAN slot when that slot is free or untouched. */
export async function promote(
  tx: Tx,
  projectId: string,
  kind: "prd" | "plan",
  row: Row | undefined,
): Promise<Adopted> {
  if (!row) return "none";
  const target = TARGET[kind];
  if (row.slug === target.slug) return "already";
  const [existing] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, projectId), eq(documents.slug, target.slug)));
  if (existing) {
    // A document someone edited, or one imported earlier, is never replaced.
    if (existing.version > 1 || parseProvenance(existing.content)) return "kept";
    await tx.delete(documents).where(eq(documents.id, existing.id));
    await removeWikiSources(tx, projectId, "document", [existing.slug]);
  }
  await tx
    .update(documents)
    .set({ slug: target.slug, type: target.type, title: target.title })
    .where(eq(documents.id, row.id));
  // The document has a new name: what the wiki read under the old one is gone with it.
  await removeWikiSources(tx, projectId, "document", [row.slug]);
  return "adopted";
}

/** Milestones and tasks from the repository's task list, only for a project with none yet. */
async function adoptTasks(
  tx: Tx,
  projectId: string,
  source: { text: string; plainItems: boolean } | null,
): Promise<number> {
  if (!source) return 0;
  const parsed = parseTasks(source.text, { plainItems: source.plainItems });
  if (parsed.length === 0) return 0;
  const existing = await tx
    .select({ source: tasks.source, status: tasks.status, assigneeId: tasks.assigneeId })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));
  if (existing.length > 0) {
    // Tasks a person touched stay. Only an untouched generated list gives way to the real one.
    const untouched = existing.every(
      (t) =>
        t.source === "plan" &&
        (t.status === "backlog" || t.status === "todo") &&
        t.assigneeId === null,
    );
    if (!untouched) return 0;
    await tx.delete(tasks).where(eq(tasks.projectId, projectId));
    await tx.delete(milestones).where(eq(milestones.projectId, projectId));
  }
  let position = 0;
  let total = 0;
  for (const [index, m] of parsed.entries()) {
    const [row] = await tx
      .insert(milestones)
      .values({ projectId, title: m.title, goal: "", position: index })
      .returning({ id: milestones.id });
    await tx.insert(tasks).values(
      m.tasks.map((t) => ({
        projectId,
        milestoneId: row.id,
        title: t.title,
        description: t.description,
        priority: "medium" as const,
        status: t.done ? ("done" as const) : ("todo" as const),
        completedAt: t.done ? new Date() : null,
        source: "imported" as const,
        position: position++,
      })),
    );
    total += m.tasks.length;
  }
  return total;
}

export async function adoptRepoDocsTx(
  tx: Tx,
  projectId: string,
  /** Paths a model chose per role, for documents the file names do not give away. */
  hints: Partial<Record<DocRole, string>> = {},
): Promise<AdoptResult> {
  const rows = await tx
    .select({
      id: documents.id,
      slug: documents.slug,
      content: documents.content,
      type: documents.type,
    })
    .from(documents)
    .where(and(eq(documents.projectId, projectId), like(documents.content, "> Imported from %")));
  const byPath = new Map<string, Row>();
  const docs: RepoDoc[] = [];
  for (const row of rows) {
    const prov = parseProvenance(row.content);
    if (!prov) continue;
    byPath.set(prov.path, row);
    docs.push({
      path: prov.path,
      content: stripProvenance(row.content),
      truncated: prov.truncated,
    });
  }
  const mapped = mapDocs(docs, hints);
  const prd = await promote(
    tx,
    projectId,
    "prd",
    mapped.prd ? byPath.get(mapped.prd.path) : undefined,
  );
  const plan = await promote(
    tx,
    projectId,
    "plan",
    mapped.plan ? byPath.get(mapped.plan.path) : undefined,
  );
  // A real task list wins; failing that, checkboxes in the plan are the tasks.
  const taskSource = mapped.tasks
    ? { text: mapped.tasks.content, plainItems: true }
    : mapped.plan
      ? { text: mapped.plan.content, plainItems: false }
      : null;
  return { prd, plan, tasks: await adoptTasks(tx, projectId, taskSource) };
}
