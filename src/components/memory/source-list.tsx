import { getTranslations } from "next-intl/server";
import type { memorySources } from "@/lib/db/schema";

type Source = typeof memorySources.$inferSelect;

/** Where a memory came from. Chats are private, so a message shows its kind, never its text. */
export async function SourceList({ sources }: { sources: Source[] }) {
  const t = await getTranslations("memoryHub");
  if (sources.length === 0)
    return <p className="text-sm text-subtle-foreground">{t("review.noSources")}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {sources.map((s) => (
        <li key={s.id} className="flex flex-wrap items-baseline gap-2">
          <span className="rounded-md border border-border-strong px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {t(`sourceType.${s.sourceType}`)}
          </span>
          {s.sourceType === "repo_file" || s.sourceType === "document" ? (
            <span className="font-mono text-xs break-all text-subtle-foreground">{s.sourceId}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
