import { useTranslations } from "next-intl";
import { type CSSProperties, useId, useState } from "react";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/ui/form";
import type { RecommendationKey } from "@/lib/domain/enums";
import type { RecommendationItem } from "@/lib/recommendations/engine";
import { cn } from "@/lib/utils";

const CONFIDENCE_TONE = {
  high: "text-success",
  medium: "text-info",
  low: "text-warning",
} as const;

/** Each recommendation shows its value, why, how sure we are and whose choice it is. */
export function RecommendationPanel({
  items,
  onOverride,
}: {
  items: RecommendationItem[];
  onOverride: (key: RecommendationKey, value: string | null) => void;
}) {
  const t = useTranslations("project.review");
  const [editing, setEditing] = useState<RecommendationItem | null>(null);
  const [draft, setDraft] = useState("");
  const inputId = useId();

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((item, i) => (
          <li
            key={item.key}
            className="reveal-item grid gap-3 p-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-start"
            style={{ "--i": i } as CSSProperties}
          >
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <div className="min-w-0">
              <p className="font-medium">
                {item.value}
                {item.detail ? (
                  <span className="font-normal text-muted-foreground"> {item.detail}</span>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">
                <span className="text-subtle-foreground">{t("why")}: </span>
                {item.reason}
              </p>
              {item.key === "landing" ? (
                <p className="mt-1 text-xs text-subtle-foreground">{t("landingWhyNot")}</p>
              ) : null}
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs">
                <span className={CONFIDENCE_TONE[item.confidence]}>
                  {t(`confidence.${item.confidence}`)}
                </span>
                <span
                  className={item.source === "user" ? "text-foreground" : "text-subtle-foreground"}
                >
                  {item.source === "user" ? "✓ " : ""}
                  {t(`source.${item.source}`)}
                </span>
              </p>
            </div>
            {item.key !== "architecture" && item.key !== "landing" ? (
              <Button
                size="sm"
                variant="outline"
                aria-label={t("changeTitle", { label: item.label })}
                onClick={() => {
                  setDraft(item.value);
                  setEditing(item);
                }}
              >
                {t("change")}
              </Button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? t("changeTitle", { label: editing.label }) : ""}
        description={editing?.reason}
      >
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = draft.trim();
              if (value) onOverride(editing.key, value);
              setEditing(null);
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
                {t("changeLabel")}
              </label>
              <input
                id={inputId}
                list={`${inputId}-options`}
                value={draft}
                maxLength={200}
                onChange={(e) => setDraft(e.target.value)}
                className={cn(FIELD_CLASS, "min-h-11 py-2.5")}
              />
              <datalist id={`${inputId}-options`}>
                {editing.alternatives.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            <ul className="flex flex-wrap gap-2" aria-label={t("changeLabel")}>
              {editing.alternatives.map((a) => (
                <li key={a}>
                  <button
                    type="button"
                    aria-pressed={draft === a}
                    onClick={() => setDraft(a)}
                    className="min-h-11 rounded-md border border-border px-3 text-sm aria-pressed:border-primary"
                  >
                    {a}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
              {editing.source === "user" ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    onOverride(editing.key, null);
                    setEditing(null);
                  }}
                >
                  {t("useRecommended")}
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit">{t("change")}</Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
