"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  createScopeAction,
  deleteScopeAction,
  seedScopeAction,
  updateScopeAction,
} from "@/app/[locale]/(app)/project/[slug]/features/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { SCOPE_CATEGORIES, type ScopeCategory } from "@/lib/domain/business";
import { ScopeItemForm, type ScopeValues } from "./scope-item-form";

export interface ScopeItemView extends ScopeValues {
  id: string;
}

/** Scope in four sections. Editing happens inline; deleting asks first. */
export function ScopeBoard({
  slug,
  items,
  canEdit,
}: {
  slug: string;
  items: ScopeItemView[];
  canEdit: boolean;
}) {
  const t = useTranslations("scope");
  const errors = useTranslations("app.errors");
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ScopeItemView | null>(null);
  const [seeded, setSeeded] = useState<number | null>(null);
  const add = useRun();
  const edit = useRun();
  const remove = useRun();
  const seed = useRun();

  return (
    <div className="space-y-6">
      <Notice tone="info">
        {canEdit ? t("clientNote") : `${t("clientNote")} ${t("readOnly")}`}
      </Notice>

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            {t("add")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={seed.pending}
            onClick={() =>
              seed.run<{ added: number }>(
                () => seedScopeAction(slug),
                (data) => setSeeded(data.added),
              )
            }
          >
            {t("generate")}
          </Button>
        </div>
      ) : null}
      <div aria-live="polite">
        {seeded !== null ? (
          <Notice tone="success">{t("generated", { count: seeded })}</Notice>
        ) : null}
      </div>
      <FormError error={seed.error} />

      {adding ? (
        <section aria-labelledby={`${id}-add`} className="rounded-lg border border-border p-5">
          <h2 id={`${id}-add`} className="mb-4 font-semibold">
            {t("add")}
          </h2>
          <ScopeItemForm
            initial={{ title: "", description: "", category: "included", clientVisible: true }}
            submitLabel={t("add")}
            pending={add.pending}
            error={add.error}
            onCancel={() => setAdding(false)}
            onSubmit={(values) =>
              add.run(
                () => createScopeAction(slug, values),
                () => setAdding(false),
              )
            }
          />
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {SCOPE_CATEGORIES.map((category: ScopeCategory) => {
          const list = items.filter((i) => i.category === category);
          return (
            <section
              key={category}
              aria-labelledby={`${id}-${category}`}
              className="min-w-0 rounded-lg border border-border p-5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 id={`${id}-${category}`} className="font-semibold">
                  {t(`categories.${category}`)}
                </h2>
                <span className="font-mono text-xs text-subtle-foreground">{list.length}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t(`categoryHints.${category}`)}</p>
              {list.length === 0 ? (
                <p className="mt-4 text-sm text-subtle-foreground">{t("emptyCategory")}</p>
              ) : (
                <ul className="mt-4 divide-y divide-border">
                  {list.map((item) =>
                    editing === item.id ? (
                      <li key={item.id} className="py-3">
                        <ScopeItemForm
                          initial={item}
                          submitLabel={t("save")}
                          pending={edit.pending}
                          error={edit.error}
                          onCancel={() => setEditing(null)}
                          onSubmit={(values) =>
                            edit.run(
                              () => updateScopeAction(slug, item.id, values),
                              () => setEditing(null),
                            )
                          }
                        />
                      </li>
                    ) : (
                      <li key={item.id} className="flex items-start gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium break-words">{item.title}</p>
                          {item.description ? (
                            <p className="mt-0.5 text-sm break-words text-muted-foreground">
                              {item.description}
                            </p>
                          ) : null}
                          <span
                            className={
                              item.clientVisible
                                ? "mt-1 inline-block font-mono text-xs text-success"
                                : "mt-1 inline-block font-mono text-xs text-subtle-foreground"
                            }
                          >
                            {item.clientVisible ? t("visibleBadge") : t("hiddenBadge")}
                          </span>
                        </div>
                        {canEdit ? (
                          <div className="flex shrink-0 gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`${t("edit")}: ${item.title}`}
                              onClick={() => {
                                edit.clear();
                                setEditing(item.id);
                              }}
                            >
                              {t("edit")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`${t("delete")}: ${item.title}`}
                              onClick={() => setDeleting(item)}
                            >
                              {t("delete")}
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={t("deleteTitle")}
        body={t("deleteBody", { title: deleting?.title ?? "" })}
        confirmLabel={t("delete")}
        pending={remove.pending}
        error={
          remove.error
            ? errors.has(remove.error.code as never)
              ? errors(remove.error.code as never)
              : errors("INTERNAL_ERROR")
            : null
        }
        onClose={() => {
          remove.clear();
          setDeleting(null);
        }}
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          remove.run(
            () => deleteScopeAction(slug, target.id),
            () => setDeleting(null),
          );
        }}
      />
    </div>
  );
}
