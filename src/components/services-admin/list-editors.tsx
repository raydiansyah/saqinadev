"use client";

import { useTranslations } from "next-intl";
import { FIELD_CLASS } from "@/components/ui/form";
import { cn } from "@/lib/utils";

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

const ROW_BUTTON =
  "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-border-strong text-sm text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

function RowControls({
  index,
  count,
  label,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  label: string;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("servicesAdmin.editor.list");
  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        className={ROW_BUTTON}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        aria-label={`${t("moveUp")}: ${label}`}
      >
        <span aria-hidden="true">↑</span>
      </button>
      <button
        type="button"
        className={ROW_BUTTON}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
        aria-label={`${t("moveDown")}: ${label}`}
      >
        <span aria-hidden="true">↓</span>
      </button>
      <button
        type="button"
        className={ROW_BUTTON}
        onClick={onRemove}
        aria-label={`${t("remove")}: ${label}`}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

function ListShell({
  id,
  label,
  error,
  addLabel,
  canAdd,
  onAdd,
  empty,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  addLabel: string;
  canAdd: boolean;
  onAdd: () => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("servicesAdmin.editor.list");
  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined} className="min-w-0 space-y-2">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {empty ? <p className="text-sm text-subtle-foreground">{t("empty")}</p> : null}
      <ul className="space-y-2">{children}</ul>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-error">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!canAdd}
        onClick={onAdd}
        className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-dashed border-border-strong px-4 text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {addLabel}
      </button>
    </fieldset>
  );
}

/** A list of short strings: add, edit, remove, reorder. Blank rows are dropped on save. */
export function StringListEditor({
  id,
  label,
  values,
  onChange,
  maxItems = 12,
  itemMax = 240,
  error,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  maxItems?: number;
  itemMax?: number;
  error?: string;
}) {
  const t = useTranslations("servicesAdmin.editor.list");
  return (
    <ListShell
      id={id}
      label={label}
      error={error}
      addLabel={`${t("add")}: ${label}`}
      canAdd={values.length < maxItems}
      onAdd={() => onChange([...values, ""])}
      empty={values.length === 0}
    >
      {values.map((value, i) => {
        const itemLabel = t("item", { label, n: i + 1 });
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: controlled rows without stable ids
            key={i}
            className="flex flex-col gap-2 sm:flex-row sm:items-start"
          >
            <input
              aria-label={itemLabel}
              value={value}
              maxLength={itemMax}
              onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
              className={cn(FIELD_CLASS, "min-h-11 min-w-0 flex-1 py-2.5")}
            />
            <RowControls
              index={i}
              count={values.length}
              label={itemLabel}
              onMove={(to) => onChange(move(values, i, to))}
              onRemove={() => onChange(values.filter((_, j) => j !== i))}
            />
          </li>
        );
      })}
    </ListShell>
  );
}

/** Rows of two fields (step title and body, question and answer). */
export function PairListEditor<T extends Record<string, string>>({
  id,
  label,
  values,
  onChange,
  keys,
  labels,
  maxLengths,
  blank,
  addLabel,
  maxItems,
  error,
}: {
  id: string;
  label: string;
  values: T[];
  onChange: (next: T[]) => void;
  keys: [keyof T & string, keyof T & string];
  labels: [string, string];
  maxLengths: [number, number];
  blank: T;
  addLabel: string;
  maxItems: number;
  error?: string;
}) {
  const t = useTranslations("servicesAdmin.editor.list");
  const [k1, k2] = keys;
  const patch = (i: number, key: string, value: string) =>
    onChange(values.map((row, j) => (j === i ? { ...row, [key]: value } : row)));
  return (
    <ListShell
      id={id}
      label={label}
      error={error}
      addLabel={addLabel}
      canAdd={values.length < maxItems}
      onAdd={() => onChange([...values, { ...blank }])}
      empty={values.length === 0}
    >
      {values.map((row, i) => {
        const itemLabel = t("item", { label, n: i + 1 });
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: controlled rows without stable ids
            key={i}
            className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-start"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <input
                aria-label={`${itemLabel}: ${labels[0]}`}
                placeholder={labels[0]}
                value={row[k1]}
                maxLength={maxLengths[0]}
                onChange={(e) => patch(i, k1, e.target.value)}
                className={cn(FIELD_CLASS, "min-h-11 py-2.5")}
              />
              <textarea
                aria-label={`${itemLabel}: ${labels[1]}`}
                placeholder={labels[1]}
                value={row[k2]}
                rows={2}
                maxLength={maxLengths[1]}
                onChange={(e) => patch(i, k2, e.target.value)}
                className={cn(FIELD_CLASS, "resize-y py-2.5 leading-relaxed")}
              />
            </div>
            <RowControls
              index={i}
              count={values.length}
              label={itemLabel}
              onMove={(to) => onChange(move(values, i, to))}
              onRemove={() => onChange(values.filter((_, j) => j !== i))}
            />
          </li>
        );
      })}
    </ListShell>
  );
}
