import { getTranslations } from "next-intl/server";
import { citation, type WikiPassage } from "@/lib/memory/wiki/retrieve";

/** One cited passage: where it was read, what it says, and a warning when its source moved on. */
export async function WikiPassageCard({ passage }: { passage: WikiPassage }) {
  const t = await getTranslations("memoryHub.wiki");
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-xs break-all text-muted-foreground">{citation(passage)}</p>
      <p className="mt-2 text-sm whitespace-pre-line text-pretty">{passage.content}</p>
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="text-subtle-foreground">{passage.title}</span>
        {passage.truncated ? (
          <span className="text-subtle-foreground">({t("truncated")})</span>
        ) : null}
        {passage.stale ? <span className="text-warning">{t("stale")}</span> : null}
        {passage.draft ? <span className="text-warning">{t("draft")}</span> : null}
      </p>
    </article>
  );
}
