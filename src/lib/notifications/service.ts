import "server-only";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Locale } from "@/i18n/locales";
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
import { notificationEmailMessage, toLocale } from "@/lib/email/templates";
import { log } from "@/lib/log";
import { normalizePhone } from "@/lib/phone";
import { loadBrand } from "@/lib/white-label/brand";
import { getWhatsappSender, whatsappText } from "./channels/whatsapp";

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
  /** Also send by WhatsApp to the client's phone number. */
  whatsapp?: boolean;
}

export interface Pending {
  ids: string[];
  email: boolean;
  /** Also send to the client's phone by WhatsApp (reminders only). */
  whatsapp?: boolean;
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
  return {
    ids: rows.map((r) => r.id),
    email: input.email ?? false,
    whatsapp: input.whatsapp ?? false,
  };
}

/** Branded HTML (with a plain-text twin) in the recipient's own language. */
export const emailFor = notificationEmailMessage;

const ATTACHED = /^\/portal\/projects\/[^/]+\/(invoices|receipts)\/([0-9a-f-]{36})$/;

/**
 * The PDF that goes with an invoice or receipt mail, or nothing. Building it must never stop the
 * mail: a failure is logged and the message goes out without the attachment.
 */
async function attachmentFor(type: string, href: string | null, locale: Locale) {
  const match = href ? ATTACHED.exec(href) : null;
  if (!match || (type !== "invoice.issued" && type !== "receipt.issued")) return undefined;
  try {
    const { buildInvoicePdf, buildReceiptPdf } = await import("@/lib/pdf/build");
    const file = await (match[1] === "invoices" ? buildInvoicePdf : buildReceiptPdf)(
      match[2],
      locale,
    );
    return [{ filename: file.filename, content: Buffer.from(file.bytes).toString("base64") }];
  } catch (error) {
    log.warn("notification.attachment_failed", { type, error: String(error).slice(0, 200) });
    return undefined;
  }
}

/** Runs the channels beyond in-app for notifications created in a committed transaction. */
export async function deliver(pending: Pending | Pending[]): Promise<void> {
  const list = Array.isArray(pending) ? pending : [pending];
  await deliverEmail(list.filter((p) => p.email).flatMap((p) => p.ids));
  await deliverWhatsapp(list.filter((p) => p.whatsapp).flatMap((p) => p.ids));
}

type Delivery = typeof notificationDeliveries.$inferInsert;

/** The agency's brand for mail and messages to its client, cached for one delivery run. */
function brandLookup() {
  const cache = new Map<string, Awaited<ReturnType<typeof loadBrand>>>();
  return async (projectId: string | null, href: string | null) => {
    if (!projectId || !href?.startsWith("/portal/")) return null;
    if (!cache.has(projectId)) {
      const [p] = await db
        .select({ org: projects.organizationId })
        .from(projects)
        .where(eq(projects.id, projectId));
      cache.set(projectId, p ? await loadBrand(p.org) : null);
    }
    return cache.get(projectId) ?? null;
  };
}

async function deliverEmail(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const configured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const rows = await db
    .select({ n: notifications, email: users.email, locale: users.locale })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(inArray(notifications.id, ids));
  const brandFor = brandLookup();
  const records: Delivery[] = [];
  for (const { n, email, locale } of rows) {
    if (!configured) {
      records.push({ notificationId: n.id, channel: "email", status: "skipped" });
      continue;
    }
    try {
      const lang = toLocale(locale);
      const brand = await brandFor(n.projectId, n.href);
      await getEmailSender().send({
        to: email,
        ...emailFor(
          n.type,
          n.params,
          n.href,
          lang,
          brand?.name ? { name: brand.name, accent: brand.accentColor } : null,
        ),
        ...(brand?.emailFromName || brand?.name
          ? { fromName: brand.emailFromName ?? brand.name ?? undefined }
          : {}),
        ...(brand?.replyTo ? { replyTo: brand.replyTo } : {}),
        attachments: await attachmentFor(n.type, n.href, lang),
      });
      records.push({ notificationId: n.id, channel: "email", status: "sent" });
    } catch (error) {
      log.warn("notification.email_failed", { id: n.id });
      records.push({
        notificationId: n.id,
        channel: "email",
        status: "failed",
        error: String(error).slice(0, 300),
      });
    }
  }
  if (records.length > 0) await db.insert(notificationDeliveries).values(records);
}

/**
 * WhatsApp goes to the client's own phone number, once per reminder however many portal users the
 * client has. A client without a usable number is skipped and the skip is recorded.
 */
async function deliverWhatsapp(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await db
    .select({
      n: notifications,
      locale: users.locale,
      phone: clients.phone,
      organizationId: projects.organizationId,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .innerJoin(projects, eq(projects.id, notifications.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(inArray(notifications.id, ids));
  const sender = getWhatsappSender();
  const brandFor = brandLookup();
  const outcome = new Map<string, Pick<Delivery, "status" | "error">>();
  const records: Delivery[] = [];
  for (const { n, locale, phone, organizationId } of rows) {
    const group = `${n.projectId}:${n.dedupKey}`;
    if (!outcome.has(group)) {
      const to = normalizePhone(phone);
      if (!to) outcome.set(group, { status: "skipped", error: "no_phone" });
      else {
        try {
          const brand = await brandFor(n.projectId, n.href);
          void organizationId;
          const lang = toLocale(locale);
          const status = await sender.send({
            to,
            text: whatsappText(n.type, n.params, n.href, lang, brand?.name ?? "Saqina Dev"),
          });
          outcome.set(group, { status });
        } catch (error) {
          log.warn("notification.whatsapp_failed", { id: n.id });
          outcome.set(group, { status: "failed", error: String(error).slice(0, 300) });
        }
      }
    }
    records.push({
      notificationId: n.id,
      channel: "whatsapp",
      ...(outcome.get(group) as object),
    } as Delivery);
  }
  if (records.length > 0) await db.insert(notificationDeliveries).values(records);
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
