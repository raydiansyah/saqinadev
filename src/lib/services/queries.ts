import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiServices } from "@/lib/db/schema";
import type { ServiceLocale } from "@/lib/domain/services";
import { type PublicService, toPublicService } from "./public";

/** The only reads public pages use. The visibility rule lives in the WHERE clause. */
const visible = and(
  eq(aiServices.isPublished, true),
  eq(aiServices.isPublic, true),
  sql`${aiServices.archivedAt} is null`,
);

export async function listPublicServices(locale: ServiceLocale): Promise<PublicService[]> {
  const rows = await db
    .select()
    .from(aiServices)
    .where(visible)
    .orderBy(asc(aiServices.displayOrder), asc(aiServices.createdAt));
  return rows.map((r) => toPublicService(r, locale));
}

export async function getPublicService(
  slug: string,
  locale: ServiceLocale,
): Promise<{ service: PublicService; related: PublicService[] } | null> {
  const [row] = await db
    .select()
    .from(aiServices)
    .where(and(visible, eq(aiServices.slug, slug)))
    .limit(1);
  if (!row) return null;
  // Related services pass through the same visibility rule: a hidden one never appears here.
  const related = row.relatedIds.length
    ? await db
        .select()
        .from(aiServices)
        .where(and(visible, inArray(aiServices.id, row.relatedIds)))
        .orderBy(asc(aiServices.displayOrder))
    : [];
  return {
    service: toPublicService(row, locale),
    related: related.map((r) => toPublicService(r, locale)),
  };
}

/** For an old URL: where it lives now, if that service is still public. */
export async function resolveServiceRedirect(slug: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: aiServices.slug })
    .from(aiServices)
    .where(and(visible, sql`${slug} = any(${aiServices.previousSlugs})`))
    .limit(1);
  return row?.slug ?? null;
}

/** Slugs for the sitemap: public services only. */
export async function listSitemapServices() {
  return db
    .select({ slug: aiServices.slug, updatedAt: aiServices.updatedAt })
    .from(aiServices)
    .where(visible)
    .orderBy(asc(aiServices.displayOrder));
}
