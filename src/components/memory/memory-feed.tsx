import { getTranslations } from "next-intl/server";
import type { MemoryCategory, MemorySource } from "@/lib/domain/enums";
import { EditMemoryButton } from "./memory-buttons";

export interface MemoryFeedItem {
  id: string;
  title: string;
  content: string;
  category: MemoryCategory;
  importance: "high" | "normal";
  source: MemorySource;
  /** ISO timestamp for <time dateTime>. */
  createdAt: string;
  time: string;
}

export interface MemoryDayGroup {
  key: string;
  label: string;
  items: MemoryFeedItem[];
}

/** Timeline of memories, newest first, grouped by calendar day. */
export async function MemoryFeed({
  slug,
  groups,
  canEdit,
}: {
  slug: string;
  groups: MemoryDayGroup[];
  canEdit: boolean;
}) {
  const t = await getTranslations("memory");

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`day-${group.key}`}>
          <h2 id={`day-${group.key}`} className="mb-3 text-sm font-medium text-muted-foreground">
            {group.label}
          </h2>
          <ol className="space-y-3 border-l border-border-strong pl-5">
            {group.items.map((m) => (
              <li key={m.id} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute top-5 -left-[1.4rem] size-2 rounded-full ${
                    m.importance === "high" ? "bg-warning" : "bg-border-strong"
                  }`}
                />
                <article className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 font-medium text-pretty">{m.title}</h3>
                    {canEdit ? (
                      <EditMemoryButton
                        slug={slug}
                        memory={{
                          id: m.id,
                          title: m.title,
                          content: m.content,
                          category: m.category,
                          importance: m.importance,
                        }}
                      />
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm whitespace-pre-line text-pretty text-muted-foreground">
                    {m.content}
                  </p>
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                    <span className="rounded-md border border-border-strong px-2 py-0.5 font-mono text-muted-foreground">
                      {t(`categories.${m.category}`)}
                    </span>
                    {m.importance === "high" ? (
                      <span className="rounded-md border border-warning/50 px-2 py-0.5 font-mono text-warning">
                        ! {t("important")}
                      </span>
                    ) : null}
                    <span className="text-subtle-foreground">{t(`sources.${m.source}`)}</span>
                    <time dateTime={m.createdAt} className="font-mono text-subtle-foreground">
                      {m.time}
                    </time>
                  </p>
                </article>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
