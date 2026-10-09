import "server-only";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Actor } from "@/lib/auth/actor";
import { getEmailSender } from "@/lib/auth/email";
import { db, type Executor } from "@/lib/db/client";
import {
  clients,
  clientUsers,
  notificationDeliveries,
  notifications,
  projectMembers,
  projects,
  users,
} from "@/lib/db/schema";
import { log } from "@/lib/log";

/**
 * Notification foundation. Every event writes in-app rows inside the caller's transaction
 * (deduplicated per user); extra channels run after commit through `deliver`, so a failing
 * email never rolls back the business change. New channels plug into CHANNELS.
 */

export interface NotifyInput {
  userIds: string[];
  projectId: string | null;
  type: string;
  params?: Record<string, string>;
  href?: string | null;
  /** Same key for the same user = one notification, however often the event fires. */
  dedupKey: string;
  /** Also send by email when an email provider is configured. */
  email?: boolean;
}

export interface Pending {
  ids: string[];
  email: boolean;
}

export async function notifyTx(executor: Executor, input: NotifyInput): Promise<Pending> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return { ids: [], email: false };
  const rows = await executor
    .insert(notifications)
    .values(
      userIds.map((userId) => ({
        userId,
        projectId: input.projectId,
        type: input.type,
        params: input.params ?? {},
        href: input.href ?? null,
        dedupKey: input.dedupKey,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return { ids: rows.map((r) => r.id), email: input.email ?? false };
}

/** Plain-text email in both languages; the recipient's locale is not stored yet. */
export function emailFor(type: string, params: Record<string, string>, href: string | null) {
  const base = (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(
    /\/$/,
    "",
  );
  const detail = Object.values(params).filter(Boolean).join(" · ");
  const link = href ? `${base}/en${href}` : base;
  const linkId = href ? `${base}/id${href}` : base;
  const subject = `Saqina Dev: ${EMAIL_SUBJECTS[type] ?? "Project update / Pembaruan project"}`;
  return {
    subject,
    text: [detail, "", link, "", detail, linkId].join("\n"),
  };
}

const EMAIL_SUBJECTS: Record<string, string> = {
  "reminder.invoice_due": "Invoice due soon / Invoice segera jatuh tempo",
  "reminder.invoice_overdue": "Invoice overdue / Invoice lewat jatuh tempo",
  "reminder.approval_pending": "Approval waiting / Menunggu persetujuan",
  "reminder.change_request_pending": "Change request waiting / Change request menunggu",
  "reminder.maintenance_renewal": "Maintenance ends soon / Maintenance segera berakhir",
  "approval.requested": "Approval requested / Permintaan persetujuan",
  "change_request.sent": "Change request to review / Change request untuk ditinjau",
  "invoice.issued": "New invoice / Invoice baru",
  "message.posted": "New message / Pesan baru",
  "client.reminder": "Reminder / Pengingat",
};

/** Runs non in-app channels for notifications created in a committed transaction. */
export async function deliver(pending: Pending | Pending[]): Promise<void> {
  const list = Array.isArray(pending) ? pending : [pending];
  const ids = list.filter((p) => p.email).flatMap((p) => p.ids);
  if (ids.length === 0) return;
  const configured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const rows = await db
    .select({ n: notifications, email: users.email })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(inArray(notifications.id, ids));
  for (const { n, email } of rows) {
    if (!configured) {
      await db
        .insert(notificationDeliveries)
        .values({ notificationId: n.id, channel: "email", status: "skipped" });
      continue;
    }
    try {
      await getEmailSender().send({ to: email, ...emailFor(n.type, n.params, n.href) });
      await db
        .insert(notificationDeliveries)
        .values({ notificationId: n.id, channel: "email", status: "sent" });
    } catch (error) {
      log.warn("notification.email_failed", { id: n.id });
      await db.insert(notificationDeliveries).values({
        notificationId: n.id,
        channel: "email",
        status: "failed",
        error: String(error).slice(0, 300),
      });
    }
  }
}

/** Project owners and admins: the people who act on client events. */
export async function teamRecipients(executor: Executor, projectId: string): Promise<string[]> {
  const rows = await executor
    .select({ id: projectMembers.userId })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        inArray(projectMembers.role, ["owner", "admin"]),
      ),
    );
  return rows.map((r) => r.id);
}

/** Portal users of the project's client, only while the portal is enabled. */
export async function clientRecipients(executor: Executor, projectId: string): Promise<string[]> {
  const rows = await executor
    .select({ id: clientUsers.userId })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(clientUsers, eq(clientUsers.clientId, clients.id))
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.portalEnabled, true),
        eq(clients.status, "active"),
        isNull(projects.archivedAt),
      ),
    );
  return rows.map((r) => r.id);
}

export interface NotificationView {
  id: string;
  type: string;
  params: Record<string, string>;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
  projectName: string | null;
}

export async function listNotifications(actor: Actor, limit = 50): Promise<NotificationView[]> {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      params: notifications.params,
      href: notifications.href,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      projectName: projects.name,
    })
    .from(notifications)
    .leftJoin(projects, eq(projects.id, notifications.projectId))
    .where(eq(notifications.userId, actor.id))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(actor: Actor): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

/** Marks one (or all, without an id) of the actor's own notifications as read. */
export async function markRead(actor: Actor, id?: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, actor.id),
        isNull(notifications.readAt),
        id ? eq(notifications.id, id) : undefined,
      ),
    );
}
