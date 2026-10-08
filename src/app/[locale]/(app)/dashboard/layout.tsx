import { AppHeader } from "@/components/app/app-header";
import { DashboardNav } from "@/components/app/dashboard-nav";
import type { Locale } from "@/i18n/locales";
import { requireActorPage } from "@/lib/auth/server";

export default async function DashboardLayout({
  children,
  params,
}: LayoutProps<"/[locale]/dashboard">) {
  const locale = (await params).locale as Locale;
  const actor = await requireActorPage("/dashboard");
  return (
    <>
      <AppHeader actor={actor} locale={locale} />
      <DashboardNav />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </>
  );
}
