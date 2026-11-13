import { getTranslations } from "next-intl/server";
import { PortalHeader } from "@/components/portal/portal-header";
import type { Locale } from "@/i18n/locales";
import { Link, redirect } from "@/i18n/navigation";
import { getActor } from "@/lib/auth/server";
import { portalBrand } from "@/lib/white-label/brand";
import { brandStyle } from "@/lib/white-label/theme";

// The client portal is per-client data behind a validated session; never cache it.
export const dynamic = "force-dynamic";

/**
 * Client portal shell. The session is validated here; each project page additionally checks
 * client access through `portalPageAccess`, the only way into project data. With white label
 * open the agency's name, logo and accent replace Saqina's; the privacy and terms links and the
 * "powered by" line stay.
 */
export default async function PortalLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const actor = await getActor();
  if (!actor)
    return redirect({
      href: { pathname: "/sign-in", query: { next: `/${locale}/portal` } },
      locale,
    });
  const [brand, t] = await Promise.all([portalBrand(actor), getTranslations("portal.footer")]);
  return (
    <div className="flex flex-1 flex-col" style={brandStyle(brand?.accentColor)}>
      <PortalHeader actor={actor} brand={brand} />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="border-t border-border py-6 text-sm text-muted-foreground print:hidden">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 sm:px-6">
          <p>{brand ? t("poweredBy") : t("saqina")}</p>
          <p className="flex gap-4">
            <Link
              href="/privacy"
              className="inline-flex min-h-11 items-center hover:text-foreground"
            >
              {t("privacy")}
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-foreground">
              {t("terms")}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
