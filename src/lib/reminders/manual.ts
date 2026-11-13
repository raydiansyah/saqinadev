import "server-only";
import { and, eq, inArray, notExists } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { todayIso } from "@/lib/billing/rules";
import { db } from "@/lib/db/client";
import { documentSignatures, documents, invoices } from "@/lib/db/schema";
import { SIGNABLE_KINDS } from "@/lib/documents/reference";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { clientRecipients, deliver, notifyTx } from "@/lib/notifications/service";
import { parse } from "@/lib/validation";

const input = z.object({
  entityType: z.enum(["invoice", "document"]),
  entityId: z.uuid(),
});

/**
 * A reminder the team sends now (from a button or an approved Saqina proposal). At most one per
 * item per day, and only about something that is actually still open.
 */
export async function sendClientReminder(actor: Actor, slug: string, raw: unknown) {
  const { entityType, entityId } = parse(input, raw);
  const pending = await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    let params: Record<string, string>;
    let path: string;
    if (entityType === "invoice") {
      const [i] = await tx
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.id, entityId),
            eq(invoices.projectId, project.id),
            inArray(invoices.status, ["issued", "sent", "partially_paid"]),
          ),
        );
      if (!i) throw new AppError("NOT_FOUND");
      params = {
        number: i.number ?? "",
        amount: formatMoney(i.total - i.amountPaid, i.currency),
        due: i.dueDate ?? "",
        project: project.name,
      };
      path = `/invoices/${i.id}`;
    } else {
      const [d] = await tx
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, entityId),
            eq(documents.projectId, project.id),
            eq(documents.status, "approved"),
            eq(documents.clientVisible, true),
            inArray(documents.type, [...SIGNABLE_KINDS]),
            notExists(
              tx
                .select({ id: documentSignatures.id })
                .from(documentSignatures)
                .where(
                  and(
                    eq(documentSignatures.documentId, documents.id),
                    eq(documentSignatures.party, "client"),
                  ),
                ),
            ),
          ),
        );
      if (!d) throw new AppError("NOT_FOUND");
      params = { title: d.title, project: project.name };
      path = `/documents/${d.slug}`;
    }
    const recipients = await clientRecipients(tx, project.id);
    if (recipients.length === 0)
      throw new AppError("CONFLICT", "No client portal users", {
        portal: "billing.noRecipients",
      });
    const out = await notifyTx(tx, {
      userIds: recipients,
      projectId: project.id,
      type: `client.reminder.${entityType}`,
      params,
      href: `/portal/projects/${project.slug}${path}`,
      dedupKey: `manual:${entityId}:${todayIso()}`,
      email: true,
    });
    if (out.ids.length === 0)
      throw new AppError("CONFLICT", "Already reminded today", {
        entity: "billing.remindedToday",
      });
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "reminder.sent",
      entityType,
      entityId,
      metadata: { manual: true, recipients: out.ids.length },
    });
    return out;
  });
  await deliver(pending);
  return { recipients: pending.ids.length };
}

/** The same reminder, found by the document's slug inside the project (what the screen knows). */
export async function remindDocumentSignature(actor: Actor, slug: string, docSlug: string) {
  const { project } = await loadProjectAccess(actor, { slug }, "project:update");
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.projectId, project.id), eq(documents.slug, docSlug)));
  if (!doc) throw new AppError("NOT_FOUND");
  return sendClientReminder(actor, slug, { entityType: "document", entityId: doc.id });
}
