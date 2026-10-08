import type { Locale } from "@/i18n/locales";
import { redirect } from "@/i18n/navigation";
import { getActor } from "@/lib/auth/server";

/**
 * Every app route needs a valid session. The proxy only checks that a cookie exists; this
 * validates it against the database. A stale cookie lands on sign-in with an explanation.
 */
export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const actor = await getActor();
  if (!actor) redirect({ href: { pathname: "/sign-in", query: { reason: "expired" } }, locale });
  return children;
}
