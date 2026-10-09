import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { todayIso } from "@/lib/billing/rules";
import { db } from "@/lib/db/client";
import { changeRequests, clientApprovals, invoices } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { clientRecipients, deliver, notifyTx } from "@/lib/notifications/service";
import { parse } from "@/lib/validation";

const input = z.object({
  entityType: z.enum(["invoice", "client_approval", "change_request"]),
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
    } else if (entityType === "client_approval") {
      const [a] = await tx
        .select()
        .from(clientApprovals)
        .where(
          and(
            eq(clientApprovals.id, entityId),
            eq(clientApprovals.projectId, project.id),
            eq(clientApprovals.status, "pending"),
          ),
        );
      if (!a) throw new AppError("NOT_FOUND");
      params = { title: a.title, project: project.name };
      path = "/approvals";
    } else {
      const [c] = await tx
        .select()
        .from(changeRequests)
        .where(
          and(
            eq(changeRequests.id, entityId),
            eq(changeRequests.projectId, project.id),
            eq(changeRequests.status, "sent"),
          ),
        );
      if (!c) throw new AppError("NOT_FOUND");
      params = {
        number: `CR-${String(c.number).padStart(3, "0")}`,
        title: c.title,
        project: project.name,
      };
      path = "/changes";
    }
    const recipients = await clientRecipients(tx, project.id);
    if (recipients.length === 0)
      throw new AppError("CONFLICT", "No client portal users", {
        portal: "engagement.noRecipients",
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
        entity: "engagement.remindedToday",
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
