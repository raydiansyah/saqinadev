import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { getLegalDocument } from "@/content/legal";
import type { Locale } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/metadata";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const doc = getLegalDocument(locale, "terms");
  return pageMetadata({ locale, path: "/terms", title: doc.title, description: doc.description });
}

export default async function Page({ params }: PageProps<"/[locale]/terms">) {
  const locale = (await params).locale as Locale;
  return <LegalPage locale={locale} doc="terms" />;
}
