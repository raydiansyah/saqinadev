import { getTranslations } from "next-intl/server";
import type { DecisionView } from "@/lib/decisions/service";
import { cn } from "@/lib/utils";
import { DecisionStatusToggle } from "./decision-buttons";

const STATUS_TONE = {
  proposed: "border-info/40 text-info",
  accepted: "border-success/40 text-success",
  superseded: "border-border-strong text-subtle-foreground",
} as const;

/** One decision: the question, the options weighed, what was chosen and why. */
export async function DecisionCard({
  slug,
  decision: d,
  createdLabel,
  canEdit,
}: {
  slug: string;
  decision: DecisionView;
  createdLabel: string;
  canEdit: boolean;
}) {
  const t = await getTranslations("decisions");
  const number = String(d.number).padStart(3, "0");

  return (
    <article
      aria-labelledby={`decision-${d.id}`}
      className={cn(
        "rounded-lg border border-border bg-surface p-5",
        d.status === "superseded" && "bg-transparent",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground">#{number}</span>
            <span className={cn("rounded-md border px-2 py-0.5 font-mono", STATUS_TONE[d.status])}>
              {t(`statuses.${d.status}`)}
            </span>
            <time dateTime={d.createdAt.toISOString()} className="text-subtle-foreground">
              {createdLabel}
            </time>
          </p>
          <h2 id={`decision-${d.id}`} className="mt-2 text-lg font-semibold text-pretty">
            {d.question}
          </h2>
        </div>
        {canEdit ? (
          <DecisionStatusToggle slug={slug} id={d.id} number={number} status={d.status} />
        ) : null}
      </div>

      <dl className="mt-4 space-y-4 text-sm">
        {d.context ? (
          <div>
            <dt className="text-subtle-foreground">{t("labels.context")}</dt>
            <dd className="mt-1 whitespace-pre-line text-pretty text-muted-foreground">
              {d.context}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-subtle-foreground">{t("labels.options")}</dt>
          <dd className="mt-2">
            <ul className="space-y-1.5">
              {d.options.map((option) => {
                const isSelected = option === d.selected;
                return (
                  <li
                    key={option}
                    className={cn(
                      "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2",
                      isSelected
                        ? "border-primary/60 font-medium text-foreground"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <span aria-hidden="true" className="w-4 font-mono">
                      {isSelected ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">{option}</span>
                    {isSelected ? (
                      <span className="font-mono text-xs text-primary">{t("labels.selected")}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="text-subtle-foreground">{t("labels.reason")}</dt>
          <dd className="mt-1 whitespace-pre-line text-pretty">{d.reason}</dd>
        </div>
      </dl>
    </article>
  );
}
