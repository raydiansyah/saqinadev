"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteRequirementAction } from "@/app/[locale]/(app)/project/[slug]/requirements/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState } from "@/components/app/states";
import { AskSaqinaButton } from "@/components/assistant/command-center";
import { LocalTime } from "@/components/primitives/local-time";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import {
  REQUIREMENT_GROUPS,
  type RequirementGroup,
  type RequirementStatus,
} from "@/lib/domain/enums";
import type { RequirementView } from "@/lib/requirements/service";
import { cn } from "@/lib/utils";
import { BulkBar } from "./bulk-bar";
import { RequirementDialog, type RequirementDraftForm } from "./requirement-dialog";

const STATUS_TONE: Record<RequirementStatus, string> = {
  confirmed: "text-success border-success/40",
  inferred: "text-info border-info/40",
  unknown: "text-warning border-warning/40",
  conflicting: "text-error border-error/40",
};

const PRIORITY_TONE = {
  critical: "text-error",
  high: "text-foreground",
  medium: "text-muted-foreground",
  low: "text-subtle-foreground",
} as const;

export function RequirementList({
  slug,
  items,
  groupLabels,
  canEdit,
}: {
  slug: string;
  items: RequirementView[];
  groupLabels: Record<RequirementGroup, string>;
  canEdit: boolean;
}) {
  const t = useTranslations("requirements");
  const states = useTranslations("app.states");
  const errors = useTranslations("app.errors");
  const [editing, setEditing] = useState<RequirementDraftForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<RequirementView | null>(null);
  // Selected requirement ids, for the bulk actions. Ids that no longer exist are dropped below.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulk = useTranslations("requirements.bulk");
  const known = new Set(items.map((r) => r.id));
  const chosen = [...selected].filter((id) => known.has(id));
  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) on ? next.add(id) : next.delete(id);
      return next;
    });

  const groups = REQUIREMENT_GROUPS.map((group) => ({
    group,
    items: items.filter((r) => r.group === group),
  }));
  const used = groups.filter((g) => g.items.length > 0);

  function remove() {
    const target = deleting;
    if (!target) return;
    startTransition(async () => {
      const result = await deleteRequirementAction(slug, target.id);
      setError(result.ok ? null : errors(result.code));
      setDeleting(null);
    });
  }

  const add = () =>
    setEditing({
      group: "features",
      title: "",
      description: "",
      priority: "medium",
      status: "confirmed",
    });

  return (
    <div className="space-y-8">
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {items.length > 0 ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={chosen.length === items.length}
                onChange={(e) =>
                  toggle(
                    items.map((r) => r.id),
                    e.target.checked,
                  )
                }
              />
              {bulk("selectAll", { count: items.length })}
            </label>
          ) : (
            <span />
          )}
          <Button size="sm" onClick={add}>
            {t("add")}
          </Button>
        </div>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {used.length === 0 ? (
        <EmptyState title={t("title")} body={t("empty")} />
      ) : (
        <>
          <nav aria-label={t("jump")}>
            <ul className="flex flex-wrap gap-2">
              {used.map(({ group, items: list }) => (
                <li key={group}>
                  <a
                    href={`#${group}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {groupLabels[group]}
                    <span className="font-mono text-xs">{list.length}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {used.map(({ group, items: list }) => (
            <section
              key={group}
              id={group}
              aria-labelledby={`${group}-heading`}
              className="scroll-mt-20"
            >
              <div className="mb-3 flex items-center gap-3">
                {canEdit ? (
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    aria-label={bulk("selectGroup", { group: groupLabels[group] })}
                    checked={list.every((r) => selected.has(r.id))}
                    onChange={(e) =>
                      toggle(
                        list.map((r) => r.id),
                        e.target.checked,
                      )
                    }
                  />
                ) : null}
                <h2 id={`${group}-heading`} className="font-semibold">
                  {groupLabels[group]}
                </h2>
              </div>
              <ul className="space-y-2" aria-busy={pending}>
                {list.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      {canEdit ? (
                        <input
                          type="checkbox"
                          className="mt-1 size-5 shrink-0 accent-primary"
                          aria-label={bulk("select", { title: r.title })}
                          checked={selected.has(r.id)}
                          onChange={(e) => toggle([r.id], e.target.checked)}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium">{r.title}</h3>
                        {r.description ? (
                          <p className="mt-1 text-sm text-pretty text-muted-foreground">
                            {r.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <AskSaqinaButton
                          context={{ type: "requirement", id: r.id, label: r.title }}
                        />
                        {canEdit ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`${states("edit")}: ${r.title}`}
                              onClick={() =>
                                setEditing({
                                  id: r.id,
                                  group: r.group,
                                  title: r.title,
                                  description: r.description,
                                  priority: r.priority,
                                  status: r.status,
                                })
                              }
                            >
                              {states("edit")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`${states("delete")}: ${r.title}`}
                              onClick={() => setDeleting(r)}
                            >
                              {states("delete")}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
                      <div className="flex gap-1">
                        <dt className="text-subtle-foreground">{t("meta.priority")}</dt>
                        <dd className={PRIORITY_TONE[r.priority]}>
                          {t(`priorities.${r.priority}`)}
                        </dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="sr-only">{t("meta.status")}</dt>
                        <dd className={cn("rounded-sm border px-1.5", STATUS_TONE[r.status])}>
                          {t(`statuses.${r.status}`)}
                        </dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-subtle-foreground">{t("meta.source")}</dt>
                        <dd>{t(`sources.${r.source}`)}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-subtle-foreground">{t("meta.confidence")}</dt>
                        <dd>{t(`confidences.${r.confidence}`)}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-subtle-foreground">{t("meta.updated")}</dt>
                        <dd>
                          <LocalTime iso={r.updatedAt} />
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {canEdit && chosen.length > 0 ? (
        <BulkBar
          slug={slug}
          ids={chosen}
          groupLabels={groupLabels}
          onDone={() => setSelected(new Set())}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={states("delete")}
        body={deleting ? t("deleteConfirm", { title: deleting.title }) : ""}
        confirmLabel={states("delete")}
        pending={pending}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
      <RequirementDialog
        slug={slug}
        initial={editing}
        groupLabels={groupLabels}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
