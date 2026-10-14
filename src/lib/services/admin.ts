import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db, type Tx } from "@/lib/db/client";
import { aiServices } from "@/lib/db/schema";
import { SERVICE_CATEGORIES, type ServiceCategory } from "@/lib/domain/services";
import { AppError } from "@/lib/errors";
import { requirePlatformOwner } from "@/lib/platform/roles";
import { parse } from "@/lib/validation";
import { type ServiceInput, serviceInput } from "./schema";
import { STARTER_SERVICES } from "./starter";

export type ServiceRow = typeof aiServices.$inferSelect;

async function audit(
  tx: Tx,
  actor: Actor,
  type: string,
  id: string,
  meta: Record<string, string | number | boolean | null> = {},
) {
  await recordAudit(tx, {
    actorId: actor.id,
    scope: "platform",
    type: `service.${type}`,
    entityType: "ai_service",
    entityId: id,
    metadata: meta,
  });
}

const FLAGS = ["isPublished", "isPublic", "isComingSoon", "isFeatured", "showPrice"] as const;
export type ServiceFlag = (typeof FLAGS)[number];

export interface ServiceListQuery {
  q?: string;
  category?: ServiceCategory;
  status?: "all" | "draft" | "published" | "hidden" | "archived";
  sort?: "order" | "updated" | "name";
  page?: number;
}
const PAGE_SIZE = 20;

export async function listServices(actor: Actor, query: ServiceListQuery = {}) {
  await requirePlatformOwner(actor);
  const q = query.q?.trim();
  const status = query.status ?? "all";
  const where = and(
    status === "archived" ? isNotNull(aiServices.archivedAt) : isNull(aiServices.archivedAt),
    query.category && SERVICE_CATEGORIES.includes(query.category)
      ? eq(aiServices.category, query.category)
      : undefined,
    status === "draft" ? eq(aiServices.isPublished, false) : undefined,
    status === "published"
      ? and(eq(aiServices.isPublished, true), eq(aiServices.isPublic, true))
      : undefined,
    status === "hidden" ? eq(aiServices.isPublic, false) : undefined,
    q
      ? or(
          ilike(aiServices.internalName, `%${q.replace(/[%_\\]/g, "\\$&")}%`),
          ilike(aiServices.slug, `%${q.replace(/[%_\\]/g, "\\$&")}%`),
        )
      : undefined,
  );
  const order =
    query.sort === "updated"
      ? desc(aiServices.updatedAt)
      : query.sort === "name"
        ? asc(aiServices.internalName)
        : asc(aiServices.displayOrder);
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(aiServices)
      .where(where)
      .orderBy(order, asc(aiServices.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(aiServices).where(where),
  ]);
  return { rows, total: Number(total), page, pageSize: PAGE_SIZE };
}

export async function getService(actor: Actor, id: string): Promise<ServiceRow> {
  await requirePlatformOwner(actor);
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND");
  const [row] = await db.select().from(aiServices).where(eq(aiServices.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/** Lightweight list for the "related services" picker. */
export async function listServiceOptions(actor: Actor) {
  await requirePlatformOwner(actor);
  return db
    .select({ id: aiServices.id, name: aiServices.internalName, slug: aiServices.slug })
    .from(aiServices)
    .where(isNull(aiServices.archivedAt))
    .orderBy(asc(aiServices.displayOrder));
}

async function nextOrder(tx: Tx): Promise<number> {
  const [row] = await tx
    .select({ top: sql<number>`coalesce(max(${aiServices.displayOrder}), -1)` })
    .from(aiServices);
  return Number(row.top) + 1;
}

async function assertSlugFree(tx: Tx, slug: string, exceptId?: string) {
  const [taken] = await tx
    .select({ id: aiServices.id })
    .from(aiServices)
    .where(
      and(
        or(eq(aiServices.slug, slug), sql`${slug} = any(${aiServices.previousSlugs})`),
        exceptId ? ne(aiServices.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (taken) throw new AppError("CONFLICT", "Slug in use", { slug: "services.slugTaken" });
}

async function assertRelated(tx: Tx, ids: string[], selfId?: string) {
  if (ids.length === 0) return;
  if (selfId && ids.includes(selfId))
    throw new AppError("VALIDATION_ERROR", "A service cannot relate to itself", {
      relatedIds: "invalid",
    });
  const found = await tx
    .select({ id: aiServices.id })
    .from(aiServices)
    .where(inArray(aiServices.id, ids));
  if (found.length !== new Set(ids).size) throw new AppError("NOT_FOUND");
}

export async function createService(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const data = parse(serviceInput, input);
  const row = await db.transaction(async (tx) => {
    await assertSlugFree(tx, data.slug);
    await assertRelated(tx, data.relatedIds);
    const [created] = await tx
      .insert(aiServices)
      .values({ ...data, createdBy: actor.id })
      .returning({ id: aiServices.id });
    await audit(tx, actor, "created", created.id, { slug: data.slug });
    return created;
  });
  return row;
}

export async function updateService(actor: Actor, id: string, input: unknown) {
  await requirePlatformOwner(actor);
  const data = parse(serviceInput, input);
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(aiServices).where(eq(aiServices.id, id)).for("update");
    if (!current) throw new AppError("NOT_FOUND");
    await assertSlugFree(tx, data.slug, id);
    await assertRelated(tx, data.relatedIds, id);
    // Changing the slug of something that was public keeps the old URL alive as a redirect.
    const previousSlugs =
      data.slug !== current.slug
        ? [...new Set([...current.previousSlugs, current.slug])].filter((s) => s !== data.slug)
        : current.previousSlugs;
    await tx
      .update(aiServices)
      .set({ ...data, previousSlugs })
      .where(eq(aiServices.id, id));
    await audit(tx, actor, "updated", id, {
      slug: data.slug,
      published: data.isPublished,
      public: data.isPublic,
      showPrice: data.showPrice,
    });
  });
}

const flagInput = z.object({ flag: z.enum(FLAGS), value: z.boolean() });

/** Flips one switch without touching anything else (the price amount stays when hidden). */
export async function setServiceFlag(actor: Actor, id: string, input: unknown) {
  await requirePlatformOwner(actor);
  const { flag, value } = parse(flagInput, input);
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(aiServices).where(eq(aiServices.id, id)).for("update");
    if (!current) throw new AppError("NOT_FOUND");
    if (flag === "isPublished" && value && !current.title.en && !current.title.id)
      throw new AppError("VALIDATION_ERROR", "Add a title before publishing", {
        title: "services.titleRequired",
      });
    await tx
      .update(aiServices)
      .set({ [flag]: value })
      .where(eq(aiServices.id, id));
    await audit(tx, actor, "flag", id, { flag, value });
  });
}

/** Moves a service one step up or down; the whole sequence is rewritten so order is explicit. */
export async function moveService(actor: Actor, id: string, direction: "up" | "down") {
  await requirePlatformOwner(actor);
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: aiServices.id })
      .from(aiServices)
      .where(isNull(aiServices.archivedAt))
      .orderBy(asc(aiServices.displayOrder), asc(aiServices.createdAt))
      .for("update");
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) throw new AppError("NOT_FOUND");
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    for (const [position, row] of rows.entries())
      await tx.update(aiServices).set({ displayOrder: position }).where(eq(aiServices.id, row.id));
    await audit(tx, actor, "reordered", id, { direction });
  });
}

export async function archiveService(actor: Actor, id: string, archived: boolean) {
  await requirePlatformOwner(actor);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(aiServices)
      // Archiving also unpublishes, so restoring never republishes by surprise.
      .set(archived ? { archivedAt: new Date(), isPublished: false } : { archivedAt: null })
      .where(eq(aiServices.id, id))
      .returning({ id: aiServices.id });
    if (!row) throw new AppError("NOT_FOUND");
    await audit(tx, actor, archived ? "archived" : "restored", id);
  });
}

/** A copy as a private draft with a fresh slug. */
export async function duplicateService(actor: Actor, id: string) {
  await requirePlatformOwner(actor);
  const created = await db.transaction(async (tx) => {
    const [src] = await tx.select().from(aiServices).where(eq(aiServices.id, id));
    if (!src) throw new AppError("NOT_FOUND");
    let slug = `${src.slug}-copy`;
    for (let n = 2; ; n++) {
      const [taken] = await tx
        .select({ id: aiServices.id })
        .from(aiServices)
        .where(or(eq(aiServices.slug, slug), sql`${slug} = any(${aiServices.previousSlugs})`))
        .limit(1);
      if (!taken) break;
      slug = `${src.slug}-copy-${n}`;
    }
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
    const [row] = await tx
      .insert(aiServices)
      .values({
        ...rest,
        slug,
        previousSlugs: [],
        internalName: `${src.internalName} (copy)`,
        isPublished: false,
        isFeatured: false,
        archivedAt: null,
        displayOrder: await nextOrder(tx),
        createdBy: actor.id,
      })
      .returning({ id: aiServices.id });
    await audit(tx, actor, "duplicated", row.id, { from: id });
    return row;
  });
  return created;
}

/** Adds the starter services as private drafts; existing slugs are skipped. */
export async function seedStarterServices(actor: Actor): Promise<number> {
  await requirePlatformOwner(actor);
  const added = await db.transaction(async (tx) => {
    let n = 0;
    for (const starter of STARTER_SERVICES) {
      const [exists] = await tx
        .select({ id: aiServices.id })
        .from(aiServices)
        .where(eq(aiServices.slug, starter.slug))
        .limit(1);
      if (exists) continue;
      const data: ServiceInput = parse(serviceInput, starter);
      const [row] = await tx
        .insert(aiServices)
        .values({ ...data, displayOrder: await nextOrder(tx), createdBy: actor.id })
        .returning({ id: aiServices.id });
      await audit(tx, actor, "seeded", row.id, { slug: data.slug });
      n += 1;
    }
    return n;
  });
  return added;
}
