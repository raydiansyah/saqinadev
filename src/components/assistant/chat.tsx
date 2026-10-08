"use client";

import { useTranslations } from "next-intl";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorBlock } from "./blocks/simple";
import { MessageItem } from "./message-item";
import type { ChatContext } from "./types";
import type { AssistantController } from "./use-assistant";

/**
 * The conversation surface shared by the side sheet and the full page. The workspace stays
 * the source of truth; this only sends requests and shows what Saqina did or proposes.
 */
export function Chat({
  slug,
  chat,
  context,
  onClearContext,
  canWrite,
  toolbar,
  className,
}: {
  slug: string;
  chat: AssistantController;
  context: ChatContext;
  onClearContext?: () => void;
  canWrite: boolean;
  toolbar?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("assistant");
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
  const tail = chat.messages.at(-1);

  // Keep the newest output in view while it streams.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on content changes
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, tail?.content, tail?.blocks.length]);

  const submit = (text = draft) => {
    if (!text.trim() || chat.busy) return;
    setDraft("");
    void chat.send(text, context);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-subtle-foreground">
          {t("contextLabel")}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-xs">
          <span className="text-muted-foreground">{t(`contexts.${context.type}`)}</span>
          {context.label ? (
            <span className="max-w-48 truncate font-medium">{context.label}</span>
          ) : null}
          {context.type !== "project" && onClearContext ? (
            <button
              type="button"
              onClick={onClearContext}
              aria-label={t("contextClear")}
              className="-mr-1 ml-0.5 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </span>
        <div className="ml-auto flex items-center gap-1">{toolbar}</div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {chat.hasMore ? (
          <div className="pt-3 text-center">
            <Button size="sm" variant="ghost" onClick={() => void chat.loadOlder()}>
              {t("loadOlder")}
            </Button>
          </div>
        ) : null}
        {chat.loading && chat.messages.length === 0 ? (
          <p className="pt-6 text-sm text-muted-foreground" role="status">
            {t("loading")}
          </p>
        ) : chat.messages.length === 0 ? (
          <div className="pt-6">
            <p className="text-sm font-medium text-pretty">{t("empty.title")}</p>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">{t("empty.body")}</p>
            <ul className="mt-4 space-y-2">
              {(t.raw("empty.examples") as string[]).map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => submit(example)}
                    disabled={!canWrite && /create|buat/i.test(example)}
                    className="min-h-9 w-full rounded-md border border-border px-3 py-1.5 text-left text-sm text-muted-foreground hover:border-border-strong hover:text-foreground disabled:opacity-50"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol aria-label={t("history")} className="space-y-1">
            {chat.messages.map((message, i) => (
              <MessageItem
                key={message.id}
                slug={slug}
                message={message}
                stage={chat.stage}
                proposals={chat.proposals}
                runs={chat.runs}
                agents={chat.agents}
                canWrite={canWrite}
                isLast={i === chat.messages.length - 1}
                busy={chat.busy}
                onAnswer={(answer) => submit(answer)}
                onChanged={() => void chat.refresh()}
              />
            ))}
          </ol>
        )}
        {chat.error ? (
          <div className="mt-3 space-y-2">
            <ErrorBlock code={chat.error.code} reference={chat.error.ref} />
            {lastUser && chat.error.code !== "RATE_LIMIT" ? (
              <Button size="sm" variant="outline" onClick={() => submit(lastUser.content)}>
                {t("errors.retry")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Announces progress once per stage instead of reading every streamed token. */}
      <p className="sr-only" role="status" aria-live="polite">
        {chat.stage ? t(`stages.${chat.stage}`) : ""}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="border-t border-border p-3"
      >
        <label htmlFor={`composer-${slug}`} className="sr-only">
          {t("placeholder")}
        </label>
        <div className="flex items-end gap-2 rounded-md border border-border-strong bg-surface p-1.5 focus-within:border-primary">
          <textarea
            id={`composer-${slug}`}
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={4000}
            placeholder={t("placeholder")}
            aria-describedby={`composer-hint-${slug}`}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm [field-sizing:content] placeholder:text-subtle-foreground focus-visible:outline-none"
          />
          {chat.busy ? (
            <Button size="sm" variant="outline" onClick={chat.stop}>
              {t("stop")}
            </Button>
          ) : (
            <Button size="sm" type="submit" disabled={!draft.trim()}>
              {t("send")}
            </Button>
          )}
        </div>
        <p
          id={`composer-hint-${slug}`}
          className="mt-1.5 hidden text-xs text-subtle-foreground sm:block"
        >
          {t("composerHint")}
        </p>
      </form>
    </div>
  );
}
