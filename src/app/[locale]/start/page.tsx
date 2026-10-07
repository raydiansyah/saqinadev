import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { InterviewFlow } from "@/components/interview/interview-flow";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Container } from "@/components/primitives/container";
import { Logo } from "@/components/primitives/logo";
import type { Locale } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/metadata";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/start">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "start" });
  // Stateful tool page: keep it out of the index, but let crawlers follow its links.
  return pageMetadata({
    locale,
    path: "/start",
    title: t("metaTitle"),
    description: t("metaDescription"),
    index: false,
  });
}

export default async function StartPage({ params }: PageProps<"/[locale]/start">) {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale });
  const loading = (
    <p role="status" className="py-24 text-center text-muted-foreground">
      {t("start.loading")}
    </p>
  );

  return (
    <>
      <header className="border-b border-border">
        <Container className="flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-sm"
            aria-label={t("common.home")}
          >
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              href="/"
              className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
            >
              {t("common.backToSite")}
            </Link>
          </div>
        </Container>
      </header>
      <main id="main" className="flex-1">
        <Suspense fallback={loading}>
          <InterviewFlow loadingLabel={t("start.loading")} />
        </Suspense>
      </main>
    </>
  );
}
