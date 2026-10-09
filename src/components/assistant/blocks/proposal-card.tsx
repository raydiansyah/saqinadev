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
import { Link } from "@/i18n/navigation";
import type { PlannedAction } from "@/lib/assistant/actions/types";
import { cn } from "@/lib/utils";
import type { AgentOption, ProposalView } from "../types";
import { ActionDetail, type ToolOutcomeView, ToolResults } from "./action-detail";
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
  RUN_TOOL: "▸",
  CREATE_HANDOFF: "⇢",
  SET_PAYMENT_SCHEDULE: "~",
  CREATE_INVOICE: "+",
  CREATE_SCOPE_ITEM: "+",
  CREATE_CHANGE_REQUEST: "+",
  GENERATE_DOCUMENT: "+",
  SEND_CLIENT_REMINDER: "⇢",
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
            {proposal.status === "approved" && Array.isArray(proposal.result?.handoffs)
              ? (proposal.result.handoffs as { id: string | null; dispatched: boolean }[]).map(
                  (h, i) =>
                    h.id ? (
                      <Link
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
                        key={i}
                        href={`/project/${slug}/agents/handoffs/${h.id}`}
                        className="block text-sm text-primary underline-offset-2 hover:underline"
                      >
                        {h.dispatched ? t("handoff.sent") : t("handoff.export")} ·{" "}
                        {t("handoff.open")}
                      </Link>
                    ) : (
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
                      <p key={i} className="text-sm text-error">
                        {t("handoff.failed")}
                      </p>
                    ),
                )
              : null}
            {proposal.status === "approved" && Array.isArray(proposal.result?.tools) ? (
              <ToolResults outcomes={proposal.result.tools as ToolOutcomeView[]} />
            ) : null}
          </div>
        )}
      </footer>
    </section>
  );
}
