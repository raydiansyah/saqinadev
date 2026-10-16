import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { MemoryCategory } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";

/** List or graph, as plain links so it works without JavaScript and keeps the category. */
export async function ViewToggle({
  slug,
  view,
  category,
}: {
  slug: string;
  view: "list" | "graph";
  category: MemoryCategory | undefined;
}) {
  const t = await getTranslations("memory.views");
  const base = `/project/${slug}/memory`;
  const href = (v: "list" | "graph") => {
    const params = [
      category ? `category=${category}` : "",
      v === "graph" ? "view=graph" : "",
    ].filter(Boolean);
    return params.length ? `${base}?${params.join("&")}` : base;
  };
  return (
    <nav aria-label={t("label")} className="mb-4">
      <ul className="inline-flex rounded-md border border-border p-0.5">
        {(["list", "graph"] as const).map((v) => (
          <li key={v}>
            <Link
              href={href(v)}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded px-3 text-sm sm:min-h-9",
                view === v
                  ? "bg-surface-raised font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(v)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
