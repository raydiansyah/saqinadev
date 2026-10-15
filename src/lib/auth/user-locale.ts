import "server-only";
import { eq } from "drizzle-orm";
import type { Locale } from "@/i18n/locales";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { toLocale } from "@/lib/email/templates";

/** The language to write to someone in when no request tells us: the one they last used. */
export async function storedLocale(userId: string): Promise<Locale> {
  const [row] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId));
  return toLocale(row?.locale);
}

export async function rememberLocale(userId: string, locale: Locale | undefined) {
  if (!locale) return;
  await db.update(users).set({ locale }).where(eq(users.id, userId));
}
