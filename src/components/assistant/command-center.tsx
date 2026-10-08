"use client";

import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { listConversationsAction } from "@/app/[locale]/(app)/project/[slug]/assistant/actions";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Chat } from "./chat";
import type { ChatContext } from "./types";
import { useAssistant } from "./use-assistant";

interface CommandCenter {
  open: (context?: ChatContext) => void;
  isOpen: boolean;
}

const Ctx = createContext<CommandCenter | null>(null);

export function useCommandCenter(): CommandCenter | null {
  return useContext(Ctx);
}

/** The page the user is on, as a conversation context (documents and the PRD). */
function contextFromPath(pathname: string, slug: string): ChatContext {
  const rest = pathname.split(`/project/${slug}`)[1] ?? "";
  if (rest.startsWith("/prd")) return { type: "prd", id: "prd", label: "PRD.md" };
  const doc = rest.match(/^\/documents\/([^/?#]+)/);
  if (doc) return { type: "document", id: doc[1], label: `${doc[1].toUpperCase()}.md` };
  return { type: "project", id: null, label: "" };
}

/**
 * Project-wide "Ask Saqina". Opens as a side sheet on desktop and a full-screen sheet on
 * mobile, so the workspace stays the main surface. Contextual buttons open it about a
 * specific task, requirement, decision or document.
 */
export function CommandCenterProvider({
  slug,
  projectName,
  canWrite,
  children,
}: {
  slug: string;
  projectName: string;
  canWrite: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("assistant");
  const pathname = usePathname();
  const [isOpen, setOpen] = useState(false);
  const [explicit, setExplicit] = useState<ChatContext | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const chat = useAssistant(slug);
  const { load } = chat;

  const pageContext = useMemo(() => contextFromPath(pathname, slug), [pathname, slug]);
  const context = explicit ?? { ...pageContext, label: pageContext.label || projectName };

  const open = useCallback((next?: ChatContext) => {
    opener.current = document.activeElement;
    setExplicit(next ?? null);
    setOpen(true);
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (isOpen && !el.open) {
      el.showModal();
      // Start in the composer, not on the first toolbar button.
      el.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    }
    if (!isOpen && el.open) {
      el.close();
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [isOpen]);

  // Opening about something continues the latest thread about that same thing, if any.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void listConversationsAction(slug).then((result) => {
      if (cancelled || !result.ok) return;
      const match = result.data.find(
        (c) =>
          c.contextType === context.type &&
          (c.contextId ?? null) === (context.type === "project" ? null : context.id),
      );
      void load(match?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, slug, context.type, context.id, load]);

  // Following a link from a card (task, run, approvals) closes the sheet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: close when the route changes
  useEffect(() => setOpen(false), [pathname]);

  // Keyboard shortcut: Ctrl/Cmd + J toggles the command center.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open, isOpen }), [open, isOpen]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <button
        type="button"
        onClick={() => open()}
        className="fixed right-4 bottom-4 z-30 inline-flex min-h-12 items-center gap-2 rounded-full border border-border-strong bg-surface-raised px-4 text-sm font-medium shadow-lg lg:hidden"
      >
        <SaqinaGlyph />
        {t("ask")}
      </button>
      <dialog
        ref={dialog}
        aria-label={t("label")}
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-full border-l border-border-strong bg-background p-0 text-foreground backdrop:bg-black/50 open:flex open:flex-col open:animate-[panel-in_200ms_ease-out] motion-reduce:open:animate-none sm:w-[28rem]"
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SaqinaGlyph />
          <h2 className="text-sm font-semibold">{t("saqina")}</h2>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={chat.startNew}
              className="inline-flex min-h-9 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground"
            >
              {t("newConversation")}
            </button>
            <Link
              href={
                chat.conversationId
                  ? `/project/${slug}/assistant?c=${chat.conversationId}`
                  : `/project/${slug}/assistant`
              }
              onClick={() => setOpen(false)}
              className="inline-flex min-h-9 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground"
            >
              {t("openFull")}
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
              className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none">
                <path
                  d="M3 3l10 10M13 3 3 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
        {isOpen ? (
          <Chat
            slug={slug}
            chat={chat}
            context={context}
            onClearContext={() => setExplicit({ type: "project", id: null, label: projectName })}
            canWrite={canWrite}
          />
        ) : null}
      </dialog>
    </Ctx.Provider>
  );
}

export function SaqinaGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn("size-4 text-primary", className)}
      fill="none"
    >
      <path
        d="M3 4.5 8 2l5 2.5v7L8 14l-5-2.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M5.5 8h5M8 5.5v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Header trigger with the keyboard shortcut hint. */
export function AskSaqinaTrigger() {
  const t = useTranslations("assistant");
  const center = useCommandCenter();
  if (!center) return null;
  return (
    <button
      type="button"
      onClick={() => center.open()}
      aria-keyshortcuts="Control+J Meta+J"
      className="hidden min-h-9 items-center gap-2 rounded-md border border-border-strong px-3 text-sm text-muted-foreground hover:bg-surface-raised hover:text-foreground lg:inline-flex"
    >
      <SaqinaGlyph />
      {t("ask")}
      <kbd className="rounded border border-border px-1 font-mono text-[0.625rem] text-subtle-foreground">
        ⌘J
      </kbd>
    </button>
  );
}

/** Contextual entry point: "Ask Saqina about this task / requirement / decision / document". */
export function AskSaqinaButton({
  context,
  className,
  onBeforeOpen,
}: {
  context: ChatContext;
  className?: string;
  /** E.g. close a dialog first so two modals never stack. */
  onBeforeOpen?: () => void;
}) {
  const t = useTranslations("assistant");
  const center = useCommandCenter();
  if (!center) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onBeforeOpen?.();
        center.open(context);
      }}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground",
        className,
      )}
    >
      <SaqinaGlyph className="size-3.5" />
      {t("askAbout")}
    </button>
  );
}
