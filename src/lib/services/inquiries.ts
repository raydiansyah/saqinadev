import "server-only";
import { createHash } from "node:crypto";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { getEmailSender } from "@/lib/auth/email";
import { verifyCaptcha } from "@/lib/captcha/verify";
import { createClient } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import { aiServices, serviceInquiries } from "@/lib/db/schema";
import { INQUIRY_STATUSES, type InquiryStatus } from "@/lib/domain/services";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { listPlatformOwners, requirePlatformOwner } from "@/lib/platform/roles";
import { allow } from "@/lib/rate-limit";
import { parse } from "@/lib/validation";
import { isPubliclyVisible } from "./public";
import { inquiryInput } from "./schema";

export type Inquiry = typeof serviceInquiries.$inferSelect;

const hashIp = (ip: string) =>
  createHash("sha256")
    .update(`${process.env.BETTER_AUTH_SECRET ?? "saqina"}:${ip}`)
    .digest("hex")
    .slice(0, 32);

/**
 * Public submission. Validated on the server; the result is `ok` only after the row exists.
 * A filled honeypot is answered like a success without storing anything, so bots learn nothing.
 */
export async function submitInquiry(input: unknown, context: { ip: string }) {
  const data = parse(inquiryInput, input);
  if (data.website) return { id: null };
  if (!(await verifyCaptcha(data.captchaToken, context.ip)))
    throw new AppError("VALIDATION_ERROR", "Captcha failed", { captcha: "services.captchaFailed" });
  const ipHash = hashIp(context.ip || "unknown");
  if (
    !(await allow(`inquiry:ip:${ipHash}`, 5, 60 * 60 * 1000)) ||
    !(await allow(`inquiry:mail:${data.email}`, 3, 60 * 60 * 1000))
  )
    throw new AppError("RATE_LIMIT");

  let serviceId: string | null = null;
  let serviceSlug: string | null = null;
  if (data.serviceSlug) {
    const [service] = await db
      .select()
      .from(aiServices)
      .where(eq(aiServices.slug, data.serviceSlug));
    // A hidden, draft or unknown service cannot be the subject of a public inquiry.
    if (!service || !isPubliclyVisible(service)) throw new AppError("NOT_FOUND");
    serviceId = service.id;
    serviceSlug = service.slug;
  }
  const [row] = await db
    .insert(serviceInquiries)
    .values({
      serviceId,
      serviceSlug,
      name: data.name,
      company: data.company,
      email: data.email,
      whatsapp: data.whatsapp,
      message: data.message,
      consent: true,
      locale: data.locale,
      ipHash,
    })
    .returning({ id: serviceInquiries.id });
  await notifyOwners(data.name, serviceSlug).catch((error) =>
    log.warn("service_inquiry.notify_failed", { error: String(error) }),
  );
  return { id: row.id };
}

/** Best effort: the inquiry is already saved, so a mail failure never fails the visitor. */
async function notifyOwners(name: string, slug: string | null) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return;
  const base = (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(
    /\/$/,
    "",
  );
  for (const owner of await listPlatformOwners())
    await getEmailSender().send({
      to: owner.email,
      subject: "New service inquiry / Pertanyaan layanan baru",
      text: `${name}${slug ? ` · ${slug}` : ""}\n${base}/en/dashboard/services/inquiries\n\n${name}${slug ? ` · ${slug}` : ""}\n${base}/id/dashboard/services/inquiries`,
    });
}

export const INQUIRY_PAGE_SIZE = 25;

/** Owner inbox: optional status filter and text search, newest first, paged. */
export async function listInquiries(
  actor: Actor,
  status?: InquiryStatus,
  options: { q?: string; page?: number } = {},
) {
  await requirePlatformOwner(actor);
  // Escape LIKE wildcards so the owner's text is matched literally.
  const q = options.q
    ?.trim()
    .slice(0, 100)
    .replace(/[\\%_]/g, "\\$&");
  const where = and(
    status && INQUIRY_STATUSES.includes(status) ? eq(serviceInquiries.status, status) : undefined,
    q
      ? or(
          ilike(serviceInquiries.name, `%${q}%`),
          ilike(serviceInquiries.email, `%${q}%`),
          ilike(serviceInquiries.company, `%${q}%`),
        )
      : undefined,
  );
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const rows = await db
    .select()
    .from(serviceInquiries)
    .where(where)
    .orderBy(desc(serviceInquiries.createdAt))
    .limit(INQUIRY_PAGE_SIZE + 1)
    .offset((page - 1) * INQUIRY_PAGE_SIZE);
  // One extra row tells us whether a next page exists without a COUNT query.
  return rows.length > INQUIRY_PAGE_SIZE ? rows.slice(0, INQUIRY_PAGE_SIZE) : rows;
}

export async function newInquiryCount(actor: Actor): Promise<number> {
  await requirePlatformOwner(actor);
  const [row] = await db
    .select({ n: count() })
    .from(serviceInquiries)
    .where(eq(serviceInquiries.status, "new"));
  return Number(row?.n ?? 0);
}

export async function updateInquiryStatus(actor: Actor, id: string, input: unknown) {
  await requirePlatformOwner(actor);
  const { status } = parse(z.object({ status: z.enum(INQUIRY_STATUSES) }), input);
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND");
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(serviceInquiries)
      .where(eq(serviceInquiries.id, id))
      .for("update");
    if (!current) throw new AppError("NOT_FOUND");
    // "Converted" is reserved for the conversion itself, which records the client.
    if (status === "converted" && !current.clientId)
      throw new AppError("VALIDATION_ERROR", "Use Make client to convert", {
        status: "services.useConvert",
      });
    await tx.update(serviceInquiries).set({ status }).where(eq(serviceInquiries.id, id));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "service_inquiry.status",
      entityType: "service_inquiry",
      entityId: id,
      metadata: { from: current.status, to: status },
    });
  });
}

/**
 * Creates a client from the inquiry in the Owner's organization. Nothing else: no project,
 * proposal, agreement or invoice is created.
 */
export async function convertInquiryToClient(actor: Actor, id: string) {
  await requirePlatformOwner(actor);
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND");
  const [inquiry] = await db.select().from(serviceInquiries).where(eq(serviceInquiries.id, id));
  if (!inquiry) throw new AppError("NOT_FOUND");
  if (inquiry.clientId)
    throw new AppError("CONFLICT", "Already converted", { status: "services.alreadyConverted" });
  const client = await createClient(actor, {
    name: inquiry.name,
    company: inquiry.company,
    email: inquiry.email,
    phone: inquiry.whatsapp,
    internalNotes:
      `Service inquiry${inquiry.serviceSlug ? ` (${inquiry.serviceSlug})` : ""}:\n${inquiry.message}`.slice(
        0,
        4000,
      ),
  });
  await db.transaction(async (tx) => {
    // The guard on clientId keeps a double click from converting twice.
    const [updated] = await tx
      .update(serviceInquiries)
      .set({ clientId: client.id, status: "converted" })
      .where(and(eq(serviceInquiries.id, id), eq(serviceInquiries.status, inquiry.status)))
      .returning({ id: serviceInquiries.id });
    if (!updated) throw new AppError("CONFLICT");
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "service_inquiry.converted",
      entityType: "service_inquiry",
      entityId: id,
      metadata: { clientId: client.id },
    });
  });
  return client;
}
