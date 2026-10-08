"use server";

import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { redirect } from "@/i18n/navigation";
import { signOutServer } from "@/lib/auth/server";

/** Used as a form action; the form posts the current locale (root params are unavailable here). */
export async function signOutAction(form: FormData) {
  await signOutServer();
  const value = String(form.get("locale") ?? "");
  const locale = isLocale(value) ? value : DEFAULT_LOCALE;
  redirect({ href: { pathname: "/sign-in", query: { reason: "signed-out" } }, locale });
}
