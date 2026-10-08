"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ProposalCard } from "./blocks/proposal-card";
import { RunCard } from "./blocks/run-card";
import { ActionBlock, AnalysisBlock, ErrorBlock, QuestionBlock } from "./blocks/simple";
import type { AgentOption, ProposalView, RunView, Stage, UIMessage } from "./types";

/**
 * One turn of the conversation, laid out like a console log rather than chat bubbles:
 * a role label, the text, then structured cards for anything that matters.
 */
export function MessageItem({
  slug,
  message,
  stage,
  proposals,
  runs,
  agents,
  canWrite,
  isLast,
  busy,
  onAnswer,
  onChanged,
}: {
  slug: string;
  message: UIMessage;
  stage: Stage | null;
  proposals: Record<string, ProposalView>;
  runs: Record<string, RunView>;
  agents: AgentOption[];
  canWrite: boolean;
  isLast: boolean;
  busy: boolean;
  onAnswer: (answer: string) => void;
  onChanged: () => void;
}) {
  const t = useTranslations("assistant");
  const mine = message.role === "user";
  const working = message.status === "processing";
  // Runs started by an approved proposal are shown under it.
  const proposalRuns = (id: string) =>
    ((proposals[id]?.result?.runs as string[] | undefined) ?? [])
      .map((r) => runs[r])
      .filter(Boolean);

  return (
    <li className={cn("group", mine ? "pt-4" : "pt-2")}>
      <p
        className={cn(
          "font-mono text-[0.6875rem] uppercase tracking-wider",
          mine ? "text-subtle-foreground" : "text-primary",
        )}
      >
        {mine ? t("you") : t("saqina")}
      </p>
      {message.content ? (
        <p
          className={cn(
            "mt-1 text-sm leading-relaxed whitespace-pre-wrap text-pretty",
            mine && "text-muted-foreground",
          )}
        >
          {message.content}
        </p>
      ) : null}
      {working ? (
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <span
            aria-hidden="true"
            className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
          />
          {t(`stages.${stage ?? "analyzing"}`)}
        </p>
      ) : null}
      {message.blocks.length ? (
        <div className="mt-2 space-y-2">
          {message.blocks.map((block, i) => {
            const key = `${message.id}-${i}`;
            switch (block.type) {
              case "text":
                return (
                  <p key={key} className="text-sm whitespace-pre-wrap">
                    {block.text}
                  </p>
                );
              case "analysis":
                return <AnalysisBlock key={key} block={block} />;
              case "action":
                return <ActionBlock key={key} block={block} />;
              case "question":
                return (
                  <QuestionBlock
                    key={key}
                    block={block}
                    hideQuestion={block.question === message.content}
                    disabled={busy}
                    onAnswer={isLast && canWrite ? onAnswer : undefined}
                  />
                );
              case "proposal": {
                const proposal = proposals[block.proposalId];
                if (!proposal) return null;
                return (
                  <div key={key} className="space-y-2">
                    <ProposalCard
                      slug={slug}
                      proposal={proposal}
                      agents={agents}
                      canReview={canWrite}
                      onChanged={onChanged}
                    />
                    {proposalRuns(block.proposalId).map((r) => (
                      <RunCard key={r.run.id} slug={slug} view={r} />
                    ))}
                  </div>
                );
              }
              case "agent_run": {
                const view = runs[block.runId];
                return view ? <RunCard key={key} slug={slug} view={view} /> : null;
              }
              case "error":
                return <ErrorBlock key={key} code={block.code} reference={block.ref} />;
              default:
                return null;
            }
          })}
        </div>
      ) : null}
      {!mine && message.model && message.status === "completed" ? (
        <p className="mt-1 font-mono text-[0.6875rem] text-subtle-foreground">
          {message.model.source === "rules"
            ? t("modelRules")
            : t("modelLine", { model: message.model.label })}
          {message.model.fallbackUsed && message.model.requested
            ? ` · ${t("fallbackLine", { requested: message.model.requested })}`
            : ""}
        </p>
      ) : null}
      {message.status === "cancelled" ? (
        <p className="mt-1 text-xs text-subtle-foreground">{t("statuses.cancelled")}</p>
      ) : null}
    </li>
  );
}
