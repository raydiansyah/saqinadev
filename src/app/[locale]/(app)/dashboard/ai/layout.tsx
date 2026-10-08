import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { AiSubnav } from "@/components/platform/ai-subnav";
import { requireActorPage } from "@/lib/auth/server";
import { isPlatformOwner } from "@/lib/platform/roles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Platform owners only. Everyone else gets the generic 404 (the area is not advertised). */
export default async function AiLayout({ children }: LayoutProps<"/[locale]/dashboard/ai">) {
  const actor = await requireActorPage("/dashboard/ai");
  if (!(await isPlatformOwner(actor))) notFound();
  const t = await getTranslations("platform");
  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <AiSubnav />
      <div className="pt-6">{children}</div>
    </>
  );
}
