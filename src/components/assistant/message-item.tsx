"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { AiLabel } from "@/components/primitives/ai-label";
import { LocalTime } from "@/components/primitives/local-time";
import { cn } from "@/lib/utils";
import { ProposalCard } from "./blocks/proposal-card";
import { RunCard } from "./blocks/run-card";
import { ActionBlock, AnalysisBlock, ErrorBlock, QuestionBlock } from "./blocks/simple";
import type { AgentOption, ProposalView, RunView, Stage, UIMessage } from "./types";

/** What a message can do besides being read. Absent while a reply is still being written. */
export interface MessageTools {
  pin: (title: string) => Promise<void>;
  unpin: () => Promise<void>;
  fork: () => Promise<void>;
  /** Not offered on the last message: there is nothing after it to take back. */
  rewind?: () => void;
}

/** Everything said (and written back) to a person, as plain text for the clipboard. */
function plainText(message: UIMessage): string {
  const parts = [
    message.content,
    ...message.blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])),
  ];
  return parts.filter(Boolean).join("\n\n");
}

const IDLE_STYLE =
  "inline-flex min-h-11 items-center rounded-md px-2.5 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:opacity-50";

const ICONS = {
  copy: "M6 6V3.5A1.5 1.5 0 0 1 7.5 2h5A1.5 1.5 0 0 1 14 3.5v5A1.5 1.5 0 0 1 12.5 10H10M3.5 6h5A1.5 1.5 0 0 1 10 7.5v5A1.5 1.5 0 0 1 8.5 14h-5A1.5 1.5 0 0 1 2 12.5v-5A1.5 1.5 0 0 1 3.5 6Z",
  check: "M3 8.5 6.5 12 13 4.5",
  bookmark: "M4 2.5h8v11l-4-3-4 3z",
  fork: "M5 3v6.5M5 9.5a3 3 0 0 0 3 3h0M11 3v2.5a3 3 0 0 1-3 3H5M5 3.5a1.5 1.5 0 1 1-.01 0M11 3.5a1.5 1.5 0 1 1-.01 0M5 12.5a1.5 1.5 0 1 1-.01 0",
  rewind: "M3 8a5 5 0 1 0 1.8-3.85M3 2.5v3h3",
} as const;

function Icon({ name, filled = false }: { name: keyof typeof ICONS; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="size-4"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/**
 * An icon-only action. The label is the accessible name and the tooltip; the tooltip shows on
 * hover and on keyboard focus, and never takes the pointer.
 */
function ToolButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground focus-visible:text-foreground disabled:opacity-50",
          pressed && "text-primary",
        )}
      >
        {children}
      </button>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded border border-border-strong bg-surface-raised px-2 py-1 text-xs text-foreground opacity-0 transition-opacity group-focus-within/tip:opacity-100 group-hover/tip:opacity-100 motion-reduce:transition-none"
      >
        {label}
      </span>
    </span>
  );
}

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
  tools,
  saqinaRead,
  readers,
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
  tools?: MessageTools;
  /** For your own messages: whether Saqina has picked it up. */
  saqinaRead?: "reading" | "read";
  /** Connected agents that have read up to this message. */
  readers?: string[];
}) {
  const t = useTranslations("assistant");
  const mine = message.role === "user";
  const working = message.status === "processing";
  const [copied, setCopied] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (copiedTimer.current && clearTimeout(copiedTimer.current)), []);
  const pinned = message.chapterTitle != null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText(message));
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // The clipboard can be blocked (an insecure page, a denied permission): say nothing wrong.
      setCopied(false);
    }
  };
  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  };
  const startPin = () => {
    setTitle(message.content.replace(/\s+/g, " ").trim().slice(0, 60));
    setPinning(true);
  };
  const savePin = (event: FormEvent) => {
    event.preventDefault();
    if (!tools || !title.trim()) return;
    void run(async () => {
      await tools.pin(title.trim());
      setPinning(false);
    });
  };
  // Runs started by an approved proposal are shown under it.
  const proposalRuns = (id: string) =>
    ((proposals[id]?.result?.runs as string[] | undefined) ?? [])
      .map((r) => runs[r])
      .filter(Boolean);

  return (
    <li
      id={`message-${message.id}`}
      tabIndex={-1}
      className={cn("group scroll-mt-4 focus-visible:outline-none", mine ? "pt-4" : "pt-2")}
    >
      <p
        className={cn(
          "font-mono text-[0.6875rem] uppercase tracking-wider",
          mine ? "text-subtle-foreground" : "text-primary",
        )}
      >
        {mine ? t("you") : t("saqina")}
        {mine ? null : <AiLabel className="ml-2" />}
        <LocalTime
          iso={message.createdAt}
          compact
          className="ml-2 font-mono text-[0.6875rem] normal-case tracking-normal text-subtle-foreground"
        />
        {pinned ? (
          <span className="ml-2 inline-flex max-w-56 items-center gap-1 rounded border border-primary/50 px-1.5 py-0.5 normal-case tracking-normal text-primary">
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="size-3 shrink-0"
              fill="currentColor"
            >
              <path d="M4 2h8v12l-4-3-4 3z" />
            </svg>
            <span className="sr-only">{t("tools.chapter")}: </span>
            <span className="truncate">{message.chapterTitle}</span>
          </span>
        ) : null}
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
      {saqinaRead || readers?.length ? (
        <p className="mt-1 font-mono text-[0.6875rem] text-subtle-foreground">
          {[
            saqinaRead ? t(`read.saqina.${saqinaRead}`) : null,
            readers?.length ? t("read.agents", { names: readers.join(", ") }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {pinning ? (
        <form onSubmit={savePin} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t("tools.chapterName")}
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              className="mt-1 block min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none"
            />
          </label>
          <button type="submit" disabled={pending || !title.trim()} className={IDLE_STYLE}>
            {t("tools.save")}
          </button>
          <button type="button" onClick={() => setPinning(false)} className={IDLE_STYLE}>
            {t("tools.cancel")}
          </button>
        </form>
      ) : null}
      {tools && !working && !pinning ? (
        <div
          role="toolbar"
          aria-label={t("tools.label")}
          className="mt-1 flex flex-wrap gap-x-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
        >
          <ToolButton
            label={copied ? t("tools.copied") : t("tools.copy")}
            onClick={() => void copy()}
          >
            <Icon name={copied ? "check" : "copy"} />
          </ToolButton>
          <ToolButton
            label={pinned ? t("tools.unpin") : t("tools.pin")}
            pressed={pinned}
            disabled={pending}
            onClick={() => (pinned ? void run(tools.unpin) : startPin())}
          >
            <Icon name="bookmark" filled={pinned} />
          </ToolButton>
          <ToolButton
            label={t("tools.fork")}
            disabled={pending}
            onClick={() => void run(tools.fork)}
          >
            <Icon name="fork" />
          </ToolButton>
          {tools.rewind && canWrite ? (
            <ToolButton label={t("tools.rewind")} disabled={pending} onClick={tools.rewind}>
              <Icon name="rewind" />
            </ToolButton>
          ) : null}
        </div>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? t("tools.copied") : ""}
      </span>
    </li>
  );
}
