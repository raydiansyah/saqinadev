"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { Dialog } from "@/components/app/dialog";
import { cn } from "@/lib/utils";
import type { Yours } from "./use-yours";

export type BrowseKind = "skills" | "connectors";

export interface BrowseItem {
  kind: BrowseKind;
  /** Skill slug or connector id. */
  id: string;
  name: string;
  detail: string;
}

const tab = (on: boolean) =>
  cn(
    "min-h-11 rounded-md px-3 text-sm sm:min-h-9",
    on
      ? "bg-surface-raised font-medium text-foreground"
      : "text-muted-foreground hover:text-foreground",
  );

/**
 * Browse: everything this project can use, in two views. Discover lists it with a + Add button;
 * Yours lists what was added and offers Remove. Adding only changes what the menu shows.
 */
export function BrowseDialog({
  open,
  onClose,
  kind,
  onKind,
  items,
  loading,
  failed,
  yours,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  kind: BrowseKind;
  onKind: (kind: BrowseKind) => void;
  items: BrowseItem[];
  loading: boolean;
  failed: boolean;
  yours: Yours;
  onAdd: (item: BrowseItem) => void;
  onRemove: (item: BrowseItem) => void;
}) {
  const t = useTranslations("assistant.browse");
  const id = useId();
  const [view, setView] = useState<"yours" | "discover">("discover");
  const [query, setQuery] = useState("");

  const added = (i: BrowseItem) => yours[i.kind].includes(i.id);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        i.kind === kind &&
        (view === "discover" || yours[kind].includes(i.id)) &&
        (!q || `${i.name} ${i.detail}`.toLowerCase().includes(q)),
    );
  }, [items, kind, view, query, yours]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("title")}
      description={t("description")}
      className="max-w-2xl"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label={t("view")}
          className="flex gap-1 rounded-md border border-border p-0.5"
        >
          {(["yours", "discover"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={tab(view === v)}
            >
              {t(v)}
            </button>
          ))}
        </div>
        <div
          role="group"
          aria-label={t("kind")}
          className="flex gap-1 rounded-md border border-border p-0.5"
        >
          {(["skills", "connectors"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => onKind(k)}
              className={tab(kind === k)}
            >
              {t(k)}
            </button>
          ))}
        </div>
      </div>
      <label htmlFor={`${id}-q`} className="sr-only">
        {t("search")}
      </label>
      <input
        id={`${id}-q`}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("search")}
        className="mt-3 min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus-visible:border-primary focus-visible:outline-none sm:min-h-9"
      />
      <div className="mt-3 max-h-[min(24rem,60dvh)] overflow-y-auto" aria-live="polite">
        {failed ? (
          <p className="text-sm text-error">{t("failed")}</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("loading")}
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {query
              ? t("noMatch")
              : view === "yours"
                ? t("emptyYours")
                : kind === "skills"
                  ? t("emptySkills")
                  : t("emptyConnectors")}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {shown.map((i) => (
              <li
                key={`${i.kind}-${i.id}`}
                className="flex items-start gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  <p className="line-clamp-3 text-xs text-muted-foreground">{i.detail}</p>
                </div>
                {view === "yours" ? (
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    aria-label={t("removeNamed", { name: i.name })}
                    className="min-h-11 shrink-0 rounded-md border border-border px-3 text-xs hover:bg-surface-raised sm:min-h-9"
                  >
                    {t("remove")}
                  </button>
                ) : added(i) ? (
                  <span className="inline-flex min-h-11 shrink-0 items-center px-2 text-xs text-success sm:min-h-9">
                    <span aria-hidden="true">✓ </span>
                    {t("added")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAdd(i)}
                    aria-label={t("addNamed", { name: i.name })}
                    className="min-h-11 shrink-0 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 sm:min-h-9"
                  >
                    <span aria-hidden="true">+ </span>
                    {t("add")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
