import "server-only";
import { and, eq, like } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import { documents, requirements } from "@/lib/db/schema";
import { extractRequirements } from "./requirements";

const PROVENANCE = /^> Imported from \S+?\/blob\/[^/\s]+\/(\S+?)(?: \(truncated\))?\s*\n+/;

/**
 * Adds the requirements an imported repository's documents list. Runs when the interview is
 * completed, after the generic ones exist, so anything the documents merely repeat is skipped.
 * They come in as imported and inferred: a person still confirms each one. Projects that were
 * not imported have no repository documents, so nothing happens for them.
 */
export async function persistImportedRequirements(
  tx: Tx,
  input: { projectId: string; actorId: string },
): Promise<number> {
  const docs = await tx
    .select({ slug: documents.slug, content: documents.content })
    .from(documents)
    .where(and(eq(documents.projectId, input.projectId), like(documents.slug, "repo-%")));
  if (docs.length === 0) return 0;

  const existing = await tx
    .select({ title: requirements.title })
    .from(requirements)
    .where(eq(requirements.projectId, input.projectId));
  const found = extractRequirements(
    docs.map((d) => {
      const m = PROVENANCE.exec(d.content);
      return { path: m?.[1] ?? d.slug, content: m ? d.content.slice(m[0].length) : d.content };
    }),
    existing.map((e) => e.title),
  );
  if (found.length === 0) return 0;

  await tx.insert(requirements).values(
    found.map((r, i) => ({
      projectId: input.projectId,
      group: r.group,
      title: r.title,
      description: r.description,
      priority: "medium" as const,
      status: "inferred" as const,
      source: "imported" as const,
      confidence: "medium" as const,
      // Ahead of the generic ones in their group: the documents are the better source.
      position: i - 1000,
      updatedBy: input.actorId,
    })),
  );
  return found.length;
}
