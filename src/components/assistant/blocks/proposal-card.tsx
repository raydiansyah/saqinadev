"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  approveProposalAction,
  rejectProposalAction,
  requestRevisionAction,
} from "@/app/[locale]/(app)/project/[slug]/assistant/actions";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/ui/form";
import type { PlannedAction } from "@/lib/assistant/actions/types";
import { cn } from "@/lib/utils";
import type { AgentOption, ProposalView } from "../types";
import { ChangePreview } from "./change-preview";
import { ActionBlock, CARD, CHIP, ErrorBlock } from "./simple";

type Edits = Record<string, Record<string, unknown>>;

const RISK_TONE = {
  low: "border-border-strong text-muted-foreground",
  medium: "border-warning/50 text-warning",
  high: "border-error/50 text-error",
} as const;

const SIGN: Record<PlannedAction["type"], string> = {
  CREATE_TASK: "+",
  UPDATE_TASK: "~",
  DELETE_TASK: "−",
  CREATE_REQUIREMENT: "+",
  UPDATE_REQUIREMENT: "~",
  APPEND_PRD: "+",
  CREATE_MEMORY: "+",
  CREATE_DECISION: "+",
  ASSIGN_AGENT: "→",
};

/**
 * A plan waiting for a person. Shows exactly what will change, lets the reviewer adjust the
 * editable fields, and applies nothing until Approve. The server re-validates every edit.
 */
export function ProposalCard({
  slug,
  proposal,
  agents,
  canReview,
  onChanged,
}: {
  slug: string;
  proposal: ProposalView;
  agents: AgentOption[];
  canReview: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("assistant.proposal");
  const locale = useLocale();
  const [edits, setEdits] = useState<Edits>({});
  const [editing, setEditing] = useState(false);
  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<{ code: string; ref?: string } | null>(null);
  const [pending, start] = useTransition();
  const pendingReview = proposal.status === "pending" && canReview;

  const value = (action: PlannedAction, field: string) =>
    (edits[action.key]?.[field] ?? (action.payload as Record<string, unknown>)[field]) as string;
  const setField = (key: string, field: string, v: unknown) =>
    setEdits((e) => ({ ...e, [key]: { ...e[key], [field]: v } }));

  const run = (fn: () => Promise<{ ok: boolean; code?: string; ref?: string }>) =>
    start(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) setError({ code: result.code ?? "INTERNAL_ERROR", ref: result.ref });
      else onChanged();
    });

  const stepTitle = (step: string) => {
    const created = proposal.actions.find((a) => a.key === step && a.type === "CREATE_TASK");
    return created ? t("taskStep", { title: value(created, "title") }) : step;
  };

  return (
    <section className={cn(CARD, "overflow-hidden")} aria-label={proposal.title}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-wide text-subtle-foreground">
            {proposal.type === "agent_result" ? t("agentTitle") : t("title")}
          </p>
          <h3 className="mt-0.5 text-sm font-semibold text-pretty">{proposal.title}</h3>
          {proposal.description ? (
            <p className="mt-1 text-sm text-muted-foreground text-pretty">{proposal.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <span className={cn(CHIP, RISK_TONE[proposal.riskLevel])}>
            {t("risk")}: {t(`risks.${proposal.riskLevel}`)}
          </span>
          <span className={cn(CHIP, "border-border text-muted-foreground")}>
            {t(`categories.${proposal.category}`)}
          </span>
        </div>
      </header>

      <div className="px-3 py-2.5">
        <p className="font-mono text-xs uppercase tracking-wide text-subtle-foreground">
          {t("changes")}
        </p>
        <ol className="mt-2 space-y-3">
          {proposal.actions.map((action) => (
            <li key={action.key} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span aria-hidden="true" className="w-3 shrink-0 font-mono text-muted-foreground">
                  {SIGN[action.type]}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t(`types.${action.type}`)}
                </span>
                {action.type === "ASSIGN_AGENT" && action.optional ? (
                  <span className={cn(CHIP, "border-border text-subtle-foreground")}>
                    {t("optional")}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 pl-5">
                <ActionDetail
                  idPrefix={proposal.id}
                  action={action}
                  editing={editing && pendingReview}
                  value={(f) => value(action, f)}
                  setField={(f, v) => setField(action.key, f, v)}
                  agents={agents}
                  stepTitle={stepTitle}
                  skipped={Boolean(
                    edits[action.key]?.skip ?? (action.type === "ASSIGN_AGENT" && action.skip),
                  )}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>

      <footer className="border-t border-border px-3 py-2.5">
        {error ? <ErrorBlock code={error.code} reference={error.ref} /> : null}
        {proposal.status === "pending" ? (
          pendingReview ? (
            revising ? (
              <div className="space-y-2">
                <label className="sr-only" htmlFor={`note-${proposal.id}`}>
                  {t("notePlaceholder")}
                </label>
                <textarea
                  id={`note-${proposal.id}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder={t("notePlaceholder")}
                  className={cn(FIELD_CLASS, "min-h-16 py-2")}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        requestRevisionAction(slug, { proposalId: proposal.id, note }, locale),
                      )
                    }
                  >
                    {t("sendRevision")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRevising(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => approveProposalAction(slug, { proposalId: proposal.id, edits }))
                  }
                >
                  {t("approve")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? t("doneEditing") : t("edit")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setRevising(true)}
                >
                  {t("requestChanges")}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() =>
                    run(() => rejectProposalAction(slug, { proposalId: proposal.id }, locale))
                  }
                >
                  {t("reject")}
                </Button>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">{t("statuses.pending")}</p>
          )
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {proposal.reviewerName
                ? t("reviewedBy", {
                    status: t(`statuses.${proposal.status}`),
                    name: proposal.reviewerName,
                  })
                : t(`statuses.${proposal.status}`)}
            </p>
            {proposal.revisionNote ? (
              <p className="text-sm italic text-muted-foreground">{proposal.revisionNote}</p>
            ) : null}
            {proposal.status === "approved" && Array.isArray(proposal.result?.items) ? (
              <ActionBlock block={{ type: "action", items: proposal.result.items as never }} />
            ) : null}
          </div>
        )}
      </footer>
    </section>
  );
}

function ActionDetail({
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
