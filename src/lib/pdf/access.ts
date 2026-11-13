import "server-only";
import { eq } from "drizzle-orm";
import * as z from "zod";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { documents, invoices, projects, receipts } from "@/lib/db/schema";
import { AppError, isAppError } from "@/lib/errors";
import { loadClientProjectAccess } from "@/lib/portal/access";
import { clientDocument, clientInvoice, clientReceipt } from "@/lib/portal/views";

export type PdfKind = "invoice" | "receipt" | "document";

/**
 * Who may download a file: the team of the project (billing access for invoices and receipts), or
 * a client of it, and then only what the client portal already shows them. Any other answer,
 * including a missing record, is the same NOT_FOUND.
 */
export async function authorizePdf(actor: Actor, kind: PdfKind, id: string): Promise<void> {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND");
  const [row] =
    kind === "invoice"
      ? await db
          .select({ slug: projects.slug, docSlug: invoices.id })
          .from(invoices)
          .innerJoin(projects, eq(projects.id, invoices.projectId))
          .where(eq(invoices.id, id))
      : kind === "receipt"
        ? await db
            .select({ slug: projects.slug, docSlug: receipts.id })
            .from(receipts)
            .innerJoin(projects, eq(projects.id, receipts.projectId))
            .where(eq(receipts.id, id))
        : await db
            .select({ slug: projects.slug, docSlug: documents.slug })
            .from(documents)
            .innerJoin(projects, eq(projects.id, documents.projectId))
            .where(eq(documents.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  try {
    await loadProjectAccess(
      actor,
      { slug: row.slug },
      kind === "document" ? "project:read" : "billing:read",
    );
    return;
  } catch (error) {
    if (!isAppError(error)) throw error;
  }
  const access = await loadClientProjectAccess(actor, row.slug);
  if (kind === "invoice") await clientInvoice(access, id);
  else if (kind === "receipt") await clientReceipt(access, id);
  else await clientDocument(access, row.docSlug);
}
