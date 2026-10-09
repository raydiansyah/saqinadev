import { PortalHeader } from "@/components/portal/portal-header";
import type { Locale } from "@/i18n/locales";
import { redirect } from "@/i18n/navigation";
import { getActor } from "@/lib/auth/server";

/**
 * Client portal shell. The session is validated here; each project page additionally checks
 * client access through `portalPageAccess`, the only way into project data.
 */
export default async function PortalLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const actor = await getActor();
  if (!actor)
    return redirect({
      href: { pathname: "/sign-in", query: { next: `/${locale}/portal` } },
      locale,
    });
  return (
    <>
      <PortalHeader actor={actor} />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </>
  );
}
