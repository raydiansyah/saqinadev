import { getLocale, getTranslations } from "next-intl/server";
import type { ActivityView } from "@/lib/activity/service";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Item = ActivityView & { projectName?: string };

/** One sentence per meaningful event: who did what, and when. */
export async function ActivityList({
  items,
  viewerName,
  showProject = false,
  className,
}: {
  items: Item[];
  viewerName: string;
  showProject?: boolean;
  className?: string;
}) {
  const t = await getTranslations("activity");
  // Event sentences take different placeholders per type; pass the full set to each.
  const sentence = t as unknown as (key: string, values: Record<string, string>) => string;
  const locale = await getLocale();
  return (
    <ol className={cn("space-y-3", className)}>
      {items.map((item) => {
        const actor = !item.actorName
          ? t("system")
          : item.actorName === viewerName
            ? t("you")
            : item.actorName;
        const meta = item.metadata;
        const text = sentence(`types.${item.type.replace(".", "_")}`, {
          actor,
          title: String(meta.title ?? ""),
          number: String(meta.number ?? "").padStart(3, "0"),
          file: `${String(meta.slug ?? "doc").toUpperCase()}.md`,
          agent: String(meta.agent ?? ""),
        });
        // Changes made through chat or an agent say so, so nobody mistakes them for manual edits.
        const via =
          meta.via === "assistant"
            ? t("viaAssistant")
            : meta.via === "agent"
              ? t("viaAgent")
              : null;
        return (
          <li key={item.id} className="flex gap-3 text-sm">
            <span
              aria-hidden="true"
              className="mt-2 size-1.5 shrink-0 rounded-full bg-border-strong"
            />
            <div className="min-w-0">
              <p className="text-pretty">{text}</p>
              <p className="mt-0.5 text-xs text-subtle-foreground">
                {showProject && item.projectName ? `${item.projectName} · ` : ""}
                {via ? `${via} · ` : ""}
                <time dateTime={item.createdAt.toISOString()}>
                  {formatRelative(item.createdAt, locale)}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
