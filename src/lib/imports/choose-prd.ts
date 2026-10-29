import "server-only";
import { and, eq, like } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { documents, documentVersions, repositoryConnections } from "@/lib/db/schema";
import { parseProvenance } from "@/lib/docsync/paths";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import { promote } from "./adopt";
import { prdLikeness } from "./map-docs";

/**
 * When an import could not tell which repository document is the PRD, the person says so.
 * Only documents that came from the repository can be chosen, and only while the project has no
 * PRD of its own (or only an untouched generated one): a person's PRD is never replaced.
 */

export interface PrdCandidate {
  slug: string;
  title: string;
  path: string;
}

/** Repository documents of the project, the ones whose name looks most like a PRD first. */
export async function listPrdCandidates(access: ProjectAccess): Promise<PrdCandidate[]> {
  const rows = await db
    .select({ slug: documents.slug, title: documents.title, content: documents.content })
    .from(documents)
    .where(
      and(eq(documents.projectId, access.project.id), like(documents.content, "> Imported from %")),
    );
  return rows
    .flatMap((r) => {
      const prov = parseProvenance(r.content);
      return prov && r.slug !== "prd" ? [{ slug: r.slug, title: r.title, path: prov.path }] : [];
    })
    .sort(
      (a, b) =>
        prdLikeness(b.path) - prdLikeness(a.path) ||
        a.path.split("/").length - b.path.split("/").length ||
        a.path.localeCompare(b.path),
    );
}

const input = z.object({ docSlug: z.string().min(1).max(64) });

export async function choosePrd(actor: Actor, slug: string, raw: unknown): Promise<void> {
  const { docSlug } = parse(input, raw);
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [row] = await tx
      .select({ id: documents.id, slug: documents.slug, content: documents.content })
      .from(documents)
      .where(
        and(
          eq(documents.projectId, access.project.id),
          eq(documents.slug, docSlug),
          like(documents.content, "> Imported from %"),
        ),
      )
      .for("update");
    if (!row) throw new AppError("NOT_FOUND");
    const result = await promote(tx, access.project.id, "prd", row);
    if (result === "kept")
      throw new AppError("CONFLICT", "The project already has a PRD", { docSlug: "prd_exists" });
    await recordActivity(tx, {
      projectId: access.project.id,
      actorId: actor.id,
      type: "document.updated",
      entityType: "document",
      entityId: row.id,
      metadata: { slug: "prd", origin: "chosen", from: docSlug },
    });
  });
}

/** The project's documents come from GitHub (pull-only): its PRD may need to be found or supplied. */
export async function isGithubSourced(access: ProjectAccess): Promise<boolean> {
  const [row] = await db
    .select({ mode: repositoryConnections.docSyncMode })
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, access.project.id));
  return row?.mode === "pull_only";
}

const MAX_PRD_CHARS = 200_000;
const textInput = z.object({ content: z.string().trim().min(10).max(MAX_PRD_CHARS) });

/**
 * The PRD written or uploaded by hand, for a repository that has none. Only while the project has
 * no PRD: it never replaces one.
 */
export async function createPrdFromText(actor: Actor, slug: string, raw: unknown): Promise<void> {
  const { content } = parse(textInput, raw);
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    await insertPrdTx(tx, access, content, "manual");
  });
}

/**
 * Inserts the project's first PRD (version 1). Refuses when one exists: it never replaces a PRD,
 * a new version goes through the document save instead.
 */
export async function insertPrdTx(
  tx: Tx,
  access: ProjectAccess,
  content: string,
  origin: "manual" | "generated",
): Promise<{ version: number }> {
  const actorId = access.actor.id;
  const [existing] = await tx
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.projectId, access.project.id), eq(documents.slug, "prd")))
    .for("update");
  if (existing)
    throw new AppError("CONFLICT", "The project already has a PRD", { content: "prd_exists" });
  const [doc] = await tx
    .insert(documents)
    .values({
      projectId: access.project.id,
      type: "prd",
      title: "PRD",
      slug: "prd",
      content,
      createdBy: actorId,
      updatedBy: actorId,
    })
    .returning({ id: documents.id });
  await tx
    .insert(documentVersions)
    .values({ documentId: doc.id, version: 1, content, source: "user", createdBy: actorId });
  await recordActivity(tx, {
    projectId: access.project.id,
    actorId,
    type: "document.created",
    entityType: "document",
    entityId: doc.id,
    metadata: { slug: "prd", origin },
  });
  return { version: 1 };
}
