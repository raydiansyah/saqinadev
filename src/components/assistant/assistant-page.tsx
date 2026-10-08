"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { listConversationsAction } from "@/app/[locale]/(app)/project/[slug]/assistant/actions";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import type { ConversationListItem } from "@/lib/conversations/service";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Chat } from "./chat";
import { PROJECT_CONTEXT } from "./types";
import { useAssistant } from "./use-assistant";

type Initial = Parameters<typeof useAssistant>[1];

/** Full-page Saqina: the member's conversations beside the chat. The URL holds the selection. */
export function AssistantPage({
  slug,
  canWrite,
  conversations,
  initial,
}: {
  slug: string;
  canWrite: boolean;
  conversations: ConversationListItem[];
  initial?: Initial;
}) {
  const t = useTranslations("assistant");
  const router = useRouter();
  const selectedParam = useSearchParams().get("c");
  const chat = useAssistant(slug, initial);
  const [list, setList] = useState(conversations);
  const mobileList = useRef<HTMLDetailsElement>(null);
  const base = `/project/${slug}/assistant`;

  useEffect(() => setList(conversations), [conversations]);

  // Following a ?c link swaps the thread without remounting the page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react to the URL only
  useEffect(() => {
    if (selectedParam && selectedParam !== chat.conversationId) void chat.load(selectedParam);
  }, [selectedParam]);

  // A first message creates a conversation: show it in the list and keep the URL in sync.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react to new ids only
  useEffect(() => {
    const id = chat.conversationId;
    if (!id || list.some((item) => item.id === id)) return;
    void listConversationsAction(slug).then((result) => {
      if (result.ok) setList(result.data);
    });
    router.replace(`${base}?c=${id}`, { scroll: false });
  }, [chat.conversationId]);

  const startNew = () => {
    chat.startNew();
    if (mobileList.current) mobileList.current.open = false;
    if (selectedParam) router.replace(base, { scroll: false });
  };

  const current = list.find((item) => item.id === chat.conversationId);
  const items = (
    <ConversationList
      base={base}
      items={list}
      selectedId={chat.conversationId}
      onSelect={() => {
        if (mobileList.current) mobileList.current.open = false;
      }}
    />
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <h1 className="sr-only">{t("page.title")}</h1>

      <details
        ref={mobileList}
        className="group rounded-md border border-border bg-surface lg:hidden"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm [&::-webkit-details-marker]:hidden">
          <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-subtle-foreground">
            {t("pages.conversationsCount", { count: list.length })}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {current ? current.title || t("page.untitled") : t("pages.draft")}
          </span>
          <span
            aria-hidden="true"
            className="font-mono text-muted-foreground group-open:rotate-180 motion-reduce:transition-none"
          >
            ▾
          </span>
        </summary>
        <div className="max-h-72 overflow-y-auto border-t border-border p-2">{items}</div>
      </details>

      <aside aria-labelledby="conversations-heading" className="hidden min-w-0 lg:block">
        <h2
          id="conversations-heading"
          className="mb-2 font-mono text-[0.6875rem] uppercase tracking-wider text-subtle-foreground"
        >
          {t("page.conversations")}
        </h2>
        <div className="max-h-[calc(100dvh-16rem)] overflow-y-auto">{items}</div>
      </aside>

      <section
        aria-label={t("label")}
        className="flex h-[calc(100dvh-14rem)] min-h-[26rem] min-w-0 flex-col overflow-hidden rounded-md border border-border"
      >
        <Chat
          slug={slug}
          chat={chat}
          context={PROJECT_CONTEXT}
          canWrite={canWrite}
          toolbar={
            <Button size="sm" variant="ghost" onClick={startNew} disabled={chat.busy}>
              {t("page.newConversation")}
            </Button>
          }
        />
      </section>
    </div>
  );
}

function ConversationList({
  base,
  items,
  selectedId,
  onSelect,
}: {
  base: string;
  items: ConversationListItem[];
  selectedId: string | null;
  onSelect: () => void;
}) {
  const t = useTranslations("assistant.page");
  const locale = useLocale();
  if (items.length === 0)
    return <p className="px-1 py-2 text-sm text-muted-foreground">{t("noConversations")}</p>;
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <li key={item.id}>
            <Link
              href={`${base}?c=${item.id}`}
              scroll={false}
              onClick={onSelect}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "block min-h-11 rounded-md border px-3 py-2 hover:bg-surface-raised",
                selected ? "border-primary/60 bg-surface" : "border-transparent",
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">
                  {item.title || t("untitled")}
                </span>
                <time
                  dateTime={new Date(item.updatedAt).toISOString()}
                  className="shrink-0 font-mono text-[0.6875rem] text-subtle-foreground"
                >
                  {formatRelative(new Date(item.updatedAt), locale)}
                </time>
              </span>
              {item.lastMessage ? (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {item.lastMessage}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
