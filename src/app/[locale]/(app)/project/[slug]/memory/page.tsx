import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { CategoryFilter } from "@/components/memory/category-filter";
import { groupMemoriesByDay } from "@/components/memory/group-by-day";
import { AddMemoryButton } from "@/components/memory/memory-buttons";
import { MemoryFeed } from "@/components/memory/memory-feed";
import { MemoryGraph } from "@/components/memory/memory-graph";
import { ViewToggle } from "@/components/memory/view-toggle";
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

const DAY_MS = 86_400_000;

export default async function MemoryPage({
  params,
  searchParams,
}: PageProps<"/[locale]/project/[slug]/memory">) {
  const { slug } = await params;
  const query = await searchParams;
  const category = parseCategory(query.category);
  const view = query.view === "graph" ? "graph" : "list";
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
      <ViewToggle slug={slug} view={view} category={category} />
      <CategoryFilter slug={slug} active={category} view={view} />
      {view === "graph" && memories.length > 0 ? (
        <MemoryGraph
          slug={slug}
          items={memories.map((m) => ({
            id: m.id,
            title: m.title,
            content: m.content,
            category: m.category,
            importance: m.importance,
            source: m.source,
            entityType: m.entityType,
            createdAt: m.createdAt.toISOString(),
            isNew: Date.now() - m.createdAt.getTime() < DAY_MS,
          }))}
        />
      ) : groups.length > 0 ? (
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
