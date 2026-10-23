import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocArticle } from "@/components/docs/doc-article";
import { isLocale } from "@/i18n/locales";
import { getActor, requireActorPage } from "@/lib/auth/server";
import { canReadDocs } from "@/lib/docs/access";
import { getDoc } from "@/lib/docs/content";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal/docs/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  // The title is part of the guide: only someone who may read it gets it.
  const actor = await getActor();
  if (!actor || !(await canReadDocs(actor, "client"))) return {};
  const doc = getDoc("client", locale, slug);
  return doc ? { title: doc.title, robots: { index: false } } : {};
}

export default async function Page({ params }: PageProps<"/[locale]/portal/docs/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const actor = await requireActorPage(`/portal/docs/${slug}`);
  if (!(await canReadDocs(actor, "client"))) notFound();
  return <DocArticle audience="client" locale={locale} slug={slug} base="/portal/docs" />;
}
