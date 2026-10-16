import "server-only";
import { and, eq, like } from "drizzle-orm";
import { db, type Executor, type Tx } from "@/lib/db/client";
import { documents, requirements } from "@/lib/db/schema";
import {
  type ExtractedRequirement,
  extractRequirements,
  type SourceDoc,
  similar,
} from "./requirements";

const PROVENANCE = /^> Imported from \S+?\/blob\/[^/\s]+\/(\S+?)(?: \(truncated\))?\s*\n+/;

/** A requirement taken from a document says so in its description; nothing else does. */
export const SOURCE_MARK = "Source: ";

/** The repository documents of a project, without the line that records where they came from. */
export async function loadRepoDocs(tx: Executor, projectId: string): Promise<SourceDoc[]> {
  const docs = await tx
    .select({ slug: documents.slug, content: documents.content })
    .from(documents)
    .where(and(eq(documents.projectId, projectId), like(documents.slug, "repo-%")));
  return docs.map((d) => {
    const m = PROVENANCE.exec(d.content);
    return { path: m?.[1] ?? d.slug, content: m ? d.content.slice(m[0].length) : d.content };
  });
}

/**
 * Adds requirements the project does not have yet. Rules always run; `extra` carries anything a
 * model found, already checked against the text. Whatever the project already holds, or the two
 * sources both found, is added once. Everything comes in imported and inferred: a person still
 * confirms each one.
 */
export async function addDocRequirementsTx(
  tx: Tx,
  input: {
    projectId: string;
    actorId: string;
    docs: SourceDoc[];
    extra?: ExtractedRequirement[];
  },
): Promise<{ added: number; fromRules: number; fromAi: number }> {
  const existing = await tx
    .select({ title: requirements.title, description: requirements.description })
    .from(requirements)
    .where(eq(requirements.projectId, input.projectId));
  const titles = existing.map((e) => e.title);
  const rules = extractRequirements(input.docs, titles);
  const ai: ExtractedRequirement[] = [];
  for (const candidate of input.extra ?? []) {
    const known = [...titles, ...rules.map((r) => r.title), ...ai.map((a) => a.title)];
    if (known.some((t) => similar(t, candidate.title))) continue;
    ai.push(candidate);
  }
  const all = [...rules, ...ai];
  if (all.length === 0) return { added: 0, fromRules: 0, fromAi: 0 };

  const earlier = existing.filter((e) => e.description.includes(SOURCE_MARK)).length;
  await tx.insert(requirements).values(
    all.map((r, i) => ({
      projectId: input.projectId,
      group: r.group,
      title: r.title,
      description: r.description,
      priority: "medium" as const,
      status: "inferred" as const,
      source: "imported" as const,
      confidence: "medium" as const,
      // Ahead of the generic ones in their group: the documents are the better source.
      position: earlier + i - 1000,
      updatedBy: input.actorId,
    })),
  );
  return { added: all.length, fromRules: rules.length, fromAi: ai.length };
}

/** Called when an imported project's interview is completed. Nothing happens without documents. */
export async function persistImportedRequirements(
  tx: Tx,
  input: { projectId: string; actorId: string },
): Promise<number> {
  const docs = await loadRepoDocs(tx, input.projectId);
  if (docs.length === 0) return 0;
  return (await addDocRequirementsTx(tx, { ...input, docs })).added;
}

/** Whether the project has repository documents to read (a cheap check for the UI). */
export async function hasRepoDocs(projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.projectId, projectId), like(documents.slug, "repo-%")))
    .limit(1);
  return Boolean(row);
}
