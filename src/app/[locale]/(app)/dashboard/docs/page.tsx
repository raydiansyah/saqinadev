import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DocIndex } from "@/components/docs/doc-index";
import { isLocale } from "@/i18n/locales";
import { requireActorPage } from "@/lib/auth/server";
import { canReadDocs } from "@/lib/docs/access";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/docs">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "docs" });
  // Signed-in readers only: nothing here is for search engines.
  return { title: t("owner.metaTitle"), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/dashboard/docs">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const actor = await requireActorPage("/dashboard/docs");
  if (!(await canReadDocs(actor, "owner"))) notFound();
  return <DocIndex audience="owner" locale={locale} base="/dashboard/docs" />;
}
