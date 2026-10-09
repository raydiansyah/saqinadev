import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { documents, documentVersions } from "@/lib/db/schema";
import { DOCUMENT_STATUSES } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { type Trace, traceMetadata } from "@/lib/events/types";
import { slugify } from "@/lib/interview/rules/profile";
import { parse } from "@/lib/validation";

export type DocumentView = typeof documents.$inferSelect;
export type DocumentListItem = Omit<DocumentView, "content">;

/** File-like name used in the UI and in agent context: "prd" → "PRD.md". */
export const fileName = (slug: string) => `${slug.toUpperCase()}.md`;

/** Metadata only; contents load per document so a long PRD never rides along on a list. */
export async function listDocuments(access: ProjectAccess): Promise<DocumentListItem[]> {
  return db
    .select({
      id: documents.id,
      projectId: documents.projectId,
      type: documents.type,
      title: documents.title,
      slug: documents.slug,
      version: documents.version,
      status: documents.status,
      clientVisible: documents.clientVisible,
      createdBy: documents.createdBy,
      updatedBy: documents.updatedBy,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(eq(documents.projectId, access.project.id))
    .orderBy(asc(documents.createdAt));
}

export async function getDocument(
  access: ProjectAccess,
  docSlug: string,
): Promise<DocumentView | null> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, access.project.id), eq(documents.slug, docSlug)));
  return row ?? null;
}

export async function listVersions(access: ProjectAccess, documentId: string) {
  return db
    .select({ version: documentVersions.version, createdAt: documentVersions.createdAt })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(
      and(eq(documentVersions.documentId, documentId), eq(documents.projectId, access.project.id)),
    )
    .orderBy(desc(documentVersions.version))
    .limit(20);
}

const MAX_CONTENT = 200_000;

const saveInput = z.object({
  docSlug: z.string().min(1).max(64),
  content: z.string().max(MAX_CONTENT),
  /** Version the editor started from; a mismatch means someone else saved in between. */
  baseVersion: z.int().min(1),
});

/** Saves a new version. Optimistic concurrency: stale edits are refused, not merged. */
export async function saveDocument(actor: Actor, slug: string, input: unknown) {
  const { docSlug, content, baseVersion } = parse(saveInput, input);
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [doc] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, project.id), eq(documents.slug, docSlug)))
      .for("update");
    if (!doc) throw new AppError("NOT_FOUND");
    if (doc.version !== baseVersion)
      throw new AppError("CONFLICT", "Document changed", { content: "stale" });
    // A signed document is a record of what was agreed; changes need a new document.
    if (doc.status === "signed")
      throw new AppError("CONFLICT", "Signed documents are read-only", { content: "signed" });
    if (doc.content === content) return { version: doc.version, updatedAt: doc.updatedAt };

    const version = doc.version + 1;
    const [row] = await tx
      .update(documents)
      .set({ content, version, updatedBy: actor.id })
      .where(eq(documents.id, doc.id))
      .returning({ version: documents.version, updatedAt: documents.updatedAt });
    await tx
      .insert(documentVersions)
      .values({ documentId: doc.id, version, content, createdBy: actor.id });
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "document.updated",
      entityType: "document",
      entityId: doc.id,
      metadata: { slug: doc.slug, version },
    });
    return row;
  });
}

/**
 * Appends a markdown section as a new version. Used for approved assistant and agent changes:
 * appending never overwrites what a person wrote, so it is safe even if the document moved on
 * since the proposal was made.
 */
export async function appendDocumentSectionTx(
  tx: Tx,
  access: ProjectAccess,
  input: { docSlug: string; heading: string; body: string },
  trace: Trace,
): Promise<{ version: number }> {
  const { project, actor } = access;
  const [doc] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, project.id), eq(documents.slug, input.docSlug)))
    .for("update");
  if (!doc) throw new AppError("NOT_FOUND");
  const content = `${doc.content.trimEnd()}\n\n## ${input.heading}\n\n${input.body.trim()}\n`;
  if (content.length > MAX_CONTENT) throw new AppError("VALIDATION_ERROR", "Document too long");
  const version = doc.version + 1;
  await tx
    .update(documents)
    .set({ content, version, updatedBy: actor.id })
    .where(eq(documents.id, doc.id));
  await tx
    .insert(documentVersions)
    .values({ documentId: doc.id, version, content, createdBy: actor.id });
  await recordActivity(tx, {
    projectId: project.id,
    actorId: actor.id,
    type: "document.updated",
    entityType: "document",
    entityId: doc.id,
    metadata: { slug: doc.slug, version, ...traceMetadata(trace) },
  });
  return { version };
}

export async function setDocumentStatus(actor: Actor, slug: string, input: unknown) {
  const { docSlug, status } = parse(
    z.object({ docSlug: z.string().min(1).max(64), status: z.enum(DOCUMENT_STATUSES) }),
    input,
  );
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [doc] = await tx
      .update(documents)
      // Leaving "approved" also withdraws the document from the client portal.
      .set({
        status,
        updatedBy: actor.id,
        ...(status === "approved" || status === "signed" ? {} : { clientVisible: false }),
      })
      .where(and(eq(documents.projectId, project.id), eq(documents.slug, docSlug)))
      .returning({ id: documents.id });
    if (!doc) throw new AppError("NOT_FOUND");
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "document.updated",
      entityType: "document",
      entityId: doc.id,
      metadata: { slug: docSlug, status },
    });
  });
}

/** Shares or unshares a document on the client portal. Only approved documents can be shared. */
export async function setDocumentClientVisible(actor: Actor, slug: string, input: unknown) {
  const { docSlug, visible } = parse(
    z.object({ docSlug: z.string().min(1).max(64), visible: z.boolean() }),
    input,
  );
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const [doc] = await tx
      .select({ id: documents.id, status: documents.status })
      .from(documents)
      .where(and(eq(documents.projectId, project.id), eq(documents.slug, docSlug)))
      .for("update");
    if (!doc) throw new AppError("NOT_FOUND");
    if (visible && doc.status !== "approved" && doc.status !== "signed")
      throw new AppError("VALIDATION_ERROR", "Only approved documents can be shared", {
        visible: "documents.shareNeedsApproval",
      });
    await tx.update(documents).set({ clientVisible: visible }).where(eq(documents.id, doc.id));
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "document.updated",
      entityType: "document",
      entityId: doc.id,
      metadata: { slug: docSlug, shared: visible },
    });
  });
}

const RESERVED = new Set([
  "prd",
  "plan",
  "project",
  "tasks",
  "memory",
  "decisions",
  "changelog",
  "proposal",
  "agreement",
  "handover",
  "maintenance-agreement",
]);

export async function createDocument(actor: Actor, slug: string, input: unknown) {
  const { title } = parse(z.object({ title: z.string().trim().min(2).max(80) }), input);
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    let docSlug = slugify(title);
    if (RESERVED.has(docSlug)) docSlug = `${docSlug}-notes`;
    const existing = await tx
      .select({ slug: documents.slug })
      .from(documents)
      .where(eq(documents.projectId, project.id));
    const taken = new Set(existing.map((d) => d.slug));
    for (let n = 2; taken.has(docSlug); n++) docSlug = `${slugify(title)}-${n}`;

    const content = `# ${title}\n`;
    const [doc] = await tx
      .insert(documents)
      .values({
        projectId: project.id,
        type: "custom",
        title,
        slug: docSlug,
        content,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning();
    await tx
      .insert(documentVersions)
      .values({ documentId: doc.id, version: 1, content, createdBy: actor.id });
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "document.created",
      entityType: "document",
      entityId: doc.id,
      metadata: { slug: docSlug, title },
    });
    return { slug: doc.slug };
  });
}
