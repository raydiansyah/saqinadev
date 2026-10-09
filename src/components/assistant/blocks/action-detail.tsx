"use client";

import { useLocale, useTranslations } from "next-intl";
import { FIELD_CLASS } from "@/components/ui/form";
import type { PlannedAction } from "@/lib/assistant/actions/types";
import { resolveTermAmounts } from "@/lib/billing/rules";
import type { Currency } from "@/lib/domain/business";
import { formatMoney, formatPercent, isCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { AgentOption } from "../types";
import { ChangePreview } from "./change-preview";
import { CARD } from "./simple";

/** Renders one planned action, read-only or with its editable fields. */
export function ActionDetail({
  idPrefix,
  action,
  editing,
  value,
  setField,
  agents,
  stepTitle,
  skipped,
}: {
  idPrefix: string;
  action: PlannedAction;
  editing: boolean;
  value: (field: string) => string;
  setField: (field: string, v: unknown) => void;
  agents: AgentOption[];
  stepTitle: (step: string) => string;
  skipped: boolean;
}) {
  const t = useTranslations("assistant.proposal");
  const statuses = useTranslations("tasks.statuses");
  const locale = useLocale();
  const money = (n: number, c: string) =>
    formatMoney(n, (isCurrency(c) ? c : "IDR") as Currency, locale);
  const status = (s: string) => (statuses.has(s as never) ? statuses(s as never) : s);
  const id = (f: string) => `${idPrefix}-${action.key}-${f}`;
  const input = (field: string, multiline = false) =>
    multiline ? (
      <textarea
        id={id(field)}
        aria-label={t(`fields.${field}` as never)}
        value={value(field) ?? ""}
        onChange={(e) => setField(field, e.target.value)}
        rows={3}
        className={cn(FIELD_CLASS, "min-h-16 py-2")}
      />
    ) : (
      <input
        id={id(field)}
        aria-label={t(`fields.${field}` as never)}
        value={value(field) ?? ""}
        onChange={(e) => setField(field, e.target.value)}
        className={FIELD_CLASS}
      />
    );
  const prioritySelect = (
    <select
      aria-label={t("fields.priority")}
      value={value("priority")}
      onChange={(e) => setField("priority", e.target.value)}
      className={cn(FIELD_CLASS, "w-auto")}
    >
      {(["critical", "high", "medium", "low"] as const).map((p) => (
        <option key={p} value={p}>
          {t(`priorities.${p}`)}
        </option>
      ))}
    </select>
  );

  switch (action.type) {
    case "CREATE_TASK":
      return editing ? (
        <div className="space-y-2">
          {input("title")}
          {prioritySelect}
        </div>
      ) : (
        <p>
          <span className="font-medium">{value("title")}</span>{" "}
          <span className="text-xs text-muted-foreground">
            · {t(`priorities.${value("priority") as "high"}`)}
          </span>
        </p>
      );
    case "UPDATE_TASK":
      return (
        <div>
          <p className="font-medium">{action.before.title}</p>
          {action.payload.priority ? (
            editing ? (
              prioritySelect
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("fields.priority")}: {t(`priorities.${action.before.priority as "high"}`)} →{" "}
                {t(`priorities.${value("priority") as "high"}`)}
              </p>
            )
          ) : null}
          {action.payload.status ? (
            <p className="text-xs text-muted-foreground">
              {status(action.before.status)} → {status(action.payload.status)}
            </p>
          ) : null}
        </div>
      );
    case "DELETE_TASK":
      return (
        <p className="text-error">
          <span className="line-through">{action.before.title}</span>{" "}
          <span className="text-xs">({status(action.before.status)})</span>
        </p>
      );
    case "CREATE_REQUIREMENT":
      return editing ? (
        <div className="space-y-2">
          {input("title")}
          {input("description", true)}
        </div>
      ) : (
        <div>
          <p className="font-medium">{value("title")}</p>
          <p className="text-muted-foreground">{value("description")}</p>
        </div>
      );
    case "UPDATE_REQUIREMENT":
      return editing ? (
        input("description", true)
      ) : (
        <div>
          <p className="font-medium">{action.before.title}</p>
          <ChangePreview before={action.before.description} after={value("description")} />
        </div>
      );
    case "APPEND_PRD":
      return editing ? (
        input("body", true)
      ) : (
        <ChangePreview after={`## ${action.payload.heading}\n\n${value("body")}`} />
      );
    case "CREATE_MEMORY":
      return editing ? (
        <div className="space-y-2">
          {input("title")}
          {input("content", true)}
        </div>
      ) : (
        <div>
          <p className="font-medium">{value("title")}</p>
          <p className="whitespace-pre-wrap text-muted-foreground">{value("content")}</p>
        </div>
      );
    case "CREATE_DECISION":
      return editing ? (
        input("reason", true)
      ) : (
        <div>
          <p className="font-medium">{action.payload.selected}</p>
          <p className="text-muted-foreground">{value("reason")}</p>
        </div>
      );
    case "SET_PAYMENT_SCHEDULE": {
      const { value: total, terms } = action.payload;
      const amounts = resolveTermAmounts(total, terms) ?? [];
      return (
        <div className="space-y-1">
          <p className="font-medium">
            {t("billing.value")}: {money(total, action.display.currency)}
          </p>
          <ul className="text-sm">
            {terms.map((term, i) => (
              <li
                key={`${term.label}-${term.percentBp ?? term.amount}`}
                className="flex justify-between gap-3"
              >
                <span>
                  {term.label}
                  {term.percentBp != null ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatPercent(term.percentBp)}
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums">
                  {amounts[i] != null ? money(amounts[i], action.display.currency) : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "CREATE_INVOICE":
      return (
        <p>
          <span className="font-medium">{action.display.label}</span>{" "}
          <span className="tabular-nums text-muted-foreground">
            {money(action.display.amount, action.display.currency)}
          </span>
          <span className="block text-xs text-muted-foreground">{t("billing.draftOnly")}</span>
        </p>
      );
    case "CREATE_SCOPE_ITEM":
      return editing ? (
        <div className="space-y-2">
          {input("title")}
          {input("description", true)}
        </div>
      ) : (
        <p>
          <span className="font-medium">{value("title")}</span>{" "}
          <span className="text-xs text-muted-foreground">
            · {t(`scopeCategories.${action.payload.category}`)}
          </span>
        </p>
      );
    case "CREATE_HANDOFF":
      return (
        <div className="space-y-2">
          <p>
            <span className="font-medium">{action.display.agent}</span>
            {action.display.task ? (
              <span className="text-muted-foreground"> · {action.display.task}</span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("handoff.files")}:{" "}
            <span className="font-mono">{action.display.files.join(", ")}</span>
          </p>
          {editing ? (
            input("instructions", true)
          ) : value("instructions") ? (
            <p className="text-sm">{value("instructions")}</p>
          ) : null}
        </div>
      );
    case "RUN_TOOL": {
      const input = action.payload.input as {
        branch?: string;
        message?: string;
        title?: string;
        files?: { path: string; content: string }[];
      };
      return (
        <div className="space-y-2">
          <p>
            <span className="font-mono font-medium">{action.display.name}</span>{" "}
            <span className="text-xs text-muted-foreground">
              · {t(`tool.source.${action.display.source as "git"}`)} · {t("risk")}:{" "}
              {t(
                `risks.${(action.display.risk === "critical" ? "high" : action.display.risk) as "high"}`,
              )}
            </span>
          </p>
          {input.branch ? (
            <p className="text-xs text-muted-foreground">
              {t("tool.branch")}: <span className="font-mono">{input.branch}</span>
            </p>
          ) : null}
          {input.message || input.title ? (
            <p className="text-sm">{input.message ?? input.title}</p>
          ) : null}
          {input.files?.map((file) => (
            <div key={file.path}>
              <p className="font-mono text-xs text-muted-foreground">{file.path}</p>
              <ChangePreview after={file.content} />
            </div>
          ))}
        </div>
      );
    }
    case "ASSIGN_AGENT": {
      const ref = action.payload.task;
      const target = "step" in ref ? stepTitle(ref.step) : "";
      const agent = agents.find((a) => a.id === value("agentId"));
      return (
        <div className={cn("space-y-2", skipped && "opacity-60")}>
          {editing && agents.length ? (
            <select
              aria-label={t("fields.agent")}
              value={value("agentId")}
              onChange={(e) => setField("agentId", e.target.value)}
              className={cn(FIELD_CLASS, "w-auto")}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : (
            <p>
              <span className="font-medium">{agent?.name ?? "Agent"}</span>
              {target ? <span className="text-muted-foreground"> · {target}</span> : null}
            </p>
          )}
          {action.optional && editing ? (
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!skipped}
                onChange={(e) => setField("skip", !e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              {t("skip")}
            </label>
          ) : null}
        </div>
      );
    }
  }
}

export interface ToolOutcomeView {
  tool: string;
  status: "succeeded" | "failed" | "skipped";
  code?: string;
  output?: { url?: string; sha?: string; branch?: string };
}

/** What actually happened when approved tools ran, including failures and skipped steps. */
export function ToolResults({ outcomes }: { outcomes: ToolOutcomeView[] }) {
  const t = useTranslations("assistant.proposal.tool");
  return (
    <section className={cn(CARD, "p-3")} aria-label={t("results")}>
      <h3 className="font-mono text-xs uppercase tracking-wide text-subtle-foreground">
        {t("results")}
      </h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {outcomes.map((o, i) => {
          const name = o.tool.split(":").at(-1) ?? o.tool;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: outcomes are fixed once written
            <li key={i}>
              <span
                className={cn(
                  "font-mono",
                  o.status === "succeeded"
                    ? "text-success"
                    : o.status === "failed"
                      ? "text-error"
                      : "text-muted-foreground",
                )}
              >
                {o.status === "succeeded" ? "✓" : o.status === "failed" ? "✕" : "–"}
              </span>{" "}
              <span className="font-mono">{name}</span> · {t(o.status)}
              {o.output?.sha ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {" "}
                  · {t("commit")} {o.output.sha.slice(0, 10)}
                </span>
              ) : null}
              {o.output?.url ? (
                <a
                  href={o.output.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 text-primary underline-offset-2 hover:underline"
                >
                  {t("pr")}
                </a>
              ) : null}
              {o.status === "failed" ? (
                <p className="text-xs text-error">
                  {o.tool.startsWith("mcp:") ? t("mcpFailed") : t("gitFailed")} ({o.code})
                </p>
              ) : null}
              {o.status === "skipped" ? (
                <p className="text-xs text-muted-foreground">{t("skippedNote")}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
