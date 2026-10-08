"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { FactLabel } from "@/lib/assistant/blocks";
import { cn } from "@/lib/utils";
import type { Block } from "../types";

export const CHIP = "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs leading-none";

const LABEL_TONE: Record<FactLabel, string> = {
  confirmed: "border-success/40 text-success",
  inferred: "border-warning/50 text-warning",
  recommended: "border-info/40 text-info",
  unknown: "border-border-strong text-muted-foreground",
};

/** Says how much a statement can be trusted. The text carries the meaning, color only helps. */
export function FactBadge({ label }: { label: FactLabel }) {
  const t = useTranslations("assistant.labels");
  return <span className={cn(CHIP, "shrink-0 font-mono", LABEL_TONE[label])}>{t(label)}</span>;
}

export const CARD = "rounded-md border border-border bg-surface";

export function AnalysisBlock({ block }: { block: Extract<Block, { type: "analysis" }> }) {
  if (block.findings.length === 0) return null;
  return (
    <section className={cn(CARD, "p-3")} aria-label={block.title}>
      <h3 className="font-mono text-xs uppercase tracking-wide text-subtle-foreground">
        {block.title}
      </h3>
      <ul className="mt-2 space-y-2">
        {block.findings.map((f, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: findings are static once written
          <li key={i} className="flex items-start gap-2 text-sm">
            <FactBadge label={f.label} />
            {f.href ? (
              <Link href={f.href} className="text-pretty underline-offset-2 hover:underline">
                {f.text}
              </Link>
            ) : (
              <span className="text-pretty">{f.text}</span>
            )}
          </li>
        ))}
      </ul>
      {block.recommendation ? (
        <p className="mt-3 border-t border-border pt-2 text-sm text-muted-foreground">
          {block.recommendation}
        </p>
      ) : null}
    </section>
  );
}

export function ActionBlock({ block }: { block: Extract<Block, { type: "action" }> }) {
  const t = useTranslations("assistant.action");
  if (block.items.length === 0) return null;
  return (
    <section className={cn(CARD, "p-3")} aria-label={t("title")}>
      <h3 className="font-mono text-xs uppercase tracking-wide text-success">{t("title")}</h3>
      <ul className="mt-2 space-y-1.5">
        {block.items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: executed items never reorder
          <li key={i} className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="font-mono text-success">
              {item.change === "deleted" ? "−" : item.change === "created" ? "+" : "~"}
            </span>
            <span className="text-muted-foreground">
              {t(item.change)} · {t(`kinds.${item.kind}`)}
            </span>
            <Link
              href={item.href}
              className="min-w-0 truncate font-medium underline-offset-2 hover:underline"
            >
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function QuestionBlock({
  block,
  onAnswer,
  disabled,
  hideQuestion,
}: {
  block: Extract<Block, { type: "question" }>;
  onAnswer?: (answer: string) => void;
  disabled?: boolean;
  /** The message text already asks the question; only show the answers. */
  hideQuestion?: boolean;
}) {
  const t = useTranslations("assistant.question");
  return (
    <section className={cn(CARD, "p-3")} aria-label={t("title")}>
      {hideQuestion ? null : <p className="mb-2 text-sm font-medium">{block.question}</p>}
      <div className="flex flex-wrap gap-2">
        {block.options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled || !onAnswer}
            onClick={() => onAnswer?.(option)}
            className="min-h-9 rounded-md border border-border-strong px-3 text-left text-sm hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            {option}
          </button>
        ))}
      </div>
      {onAnswer ? <p className="mt-2 text-xs text-subtle-foreground">{t("or")}</p> : null}
    </section>
  );
}

export function ErrorBlock({ code, reference }: { code: string; reference?: string }) {
  const t = useTranslations("assistant.errors");
  const known = t.has(code as never) ? t(code as never) : t("generic");
  return (
    <p
      role="alert"
      className="rounded-md border border-error/40 bg-error/5 px-3 py-2 text-sm text-error"
    >
      {known}
      {reference ? (
        <span className="ml-1 font-mono text-xs">{t("ref", { ref: reference })}</span>
      ) : null}
    </p>
  );
}
