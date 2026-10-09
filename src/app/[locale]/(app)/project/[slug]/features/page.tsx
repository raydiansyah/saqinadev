import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { ScopeBoard } from "@/components/scope/scope-board";
import { can } from "@/lib/auth/permissions";
import { projectPageAccess } from "@/lib/projects/page";
import { listScope } from "@/lib/scope/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("scope");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function FeaturesPage({
  params,
}: PageProps<"/[locale]/project/[slug]/features">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [items, t] = await Promise.all([listScope(access.project.id), getTranslations("scope")]);

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <ScopeBoard
        slug={slug}
        canEdit={can(access.role, "content:write")}
        items={items.map((i) => ({
          id: i.id,
          title: i.title,
          description: i.description,
          category: i.category,
          clientVisible: i.clientVisible,
        }))}
      />
    </>
  );
}
