import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { MEMORY_CATEGORIES, type MemoryCategory } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";

/** Server-side filter: each category is a plain link, so it works without JavaScript. */
export async function CategoryFilter({
  slug,
  active,
  view = "list",
}: {
  slug: string;
  active: MemoryCategory | undefined;
  view?: "list" | "graph";
}) {
  const t = await getTranslations("memory");
  const base = `/project/${slug}/memory`;
  const viewParam = view === "graph" ? "view=graph" : "";
  const entries: { key: string; href: string; label: string; current: boolean }[] = [
    {
      key: "all",
      href: viewParam ? `${base}?${viewParam}` : base,
      label: t("all"),
      current: !active,
    },
    ...MEMORY_CATEGORIES.map((c) => ({
      key: c,
      href: `${base}?category=${c}${viewParam ? `&${viewParam}` : ""}`,
      label: t(`categories.${c}`),
      current: active === c,
    })),
  ];

  return (
    <nav aria-label={t("filterLabel")} className="mb-8">
      <ul className="flex flex-wrap gap-2">
        {entries.map((e) => (
          <li key={e.key}>
            <Link
              href={e.href}
              aria-current={e.current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-md border px-3 text-sm transition-colors sm:min-h-9",
                e.current
                  ? "border-primary bg-surface-raised font-medium text-foreground"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {e.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
