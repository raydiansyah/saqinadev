import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { CategoryFilter } from "@/components/memory/category-filter";
import { groupMemoriesByDay } from "@/components/memory/group-by-day";
import { AddMemoryButton } from "@/components/memory/memory-buttons";
import { MemoryFeed } from "@/components/memory/memory-feed";
import { can } from "@/lib/auth/permissions";
import { MEMORY_CATEGORIES, type MemoryCategory } from "@/lib/domain/enums";
import { listMemories } from "@/lib/memory/service";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memory");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Unknown or repeated `?category=` values fall back to "All" instead of erroring. */
function parseCategory(value: string | string[] | undefined): MemoryCategory | undefined {
  return typeof value === "string" && (MEMORY_CATEGORIES as readonly string[]).includes(value)
    ? (value as MemoryCategory)
    : undefined;
}

export default async function MemoryPage({
  params,
  searchParams,
}: PageProps<"/[locale]/project/[slug]/memory">) {
  const { slug } = await params;
  const category = parseCategory((await searchParams).category);
  const access = await projectPageAccess(slug);
  const [memories, t, locale] = await Promise.all([
    listMemories(access, category),
    getTranslations("memory"),
    getLocale(),
  ]);
  const canEdit = can(access.role, "content:write");
  const groups = groupMemoriesByDay(memories, locale, {
    today: t("today"),
    yesterday: t("yesterday"),
  });
  const addButton = canEdit ? <AddMemoryButton slug={slug} category={category} /> : null;

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} actions={addButton} />
      <CategoryFilter slug={slug} active={category} />
      {groups.length > 0 ? (
        <MemoryFeed slug={slug} groups={groups} canEdit={canEdit} />
      ) : (
        <EmptyState
          title={category ? t(`categories.${category}`) : t("title")}
          body={t("empty")}
          action={addButton}
        />
      )}
    </>
  );
}
