"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { postMessageAction } from "@/app/[locale]/(app)/project/[slug]/messages/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS, Notice } from "@/components/ui/form";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EngagementError } from "./engagement-error";

export interface MessageItem {
  id: string;
  side: "client" | "team";
  body: string;
  authorName: string | null;
  createdAt: string;
}

/** Client messages on the left, team messages on the right, composer at the bottom. */
export function MessageThread({
  slug,
  messages,
  canWrite,
}: {
  slug: string;
  messages: MessageItem[];
  canWrite: boolean;
}) {
  const t = useTranslations("engagement.messages");
  const common = useTranslations("engagement.common");
  const locale = useLocale();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const end = useRef<HTMLLIElement>(null);
  const { pending, error, run } = useRun();

  // Keep the newest message in view when the thread loads or grows.
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    if (lastId) end.current?.scrollIntoView({ block: "nearest" });
  }, [lastId]);

  return (
    <div className="rounded-lg border border-border">
      {messages.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol
          aria-label={t("threadLabel")}
          className="max-h-[60vh] space-y-3 overflow-y-auto px-3 py-4 sm:px-4"
        >
          {messages.map((m) => {
            const team = m.side === "team";
            return (
              <li key={m.id} className={cn("flex", team ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] min-w-0 rounded-lg border px-3 py-2 sm:max-w-[70%]",
                    team ? "border-primary/30 bg-primary/10" : "border-border bg-surface",
                  )}
                >
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {m.authorName ?? common("unknownAuthor")}
                    </span>{" "}
                    · {team ? common("team") : common("client")} ·{" "}
                    <time dateTime={m.createdAt}>
                      {formatDateTime(new Date(m.createdAt), locale)}
                    </time>
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-line break-words">{m.body}</p>
                </div>
              </li>
            );
          })}
          <li ref={end} aria-hidden="true" />
        </ol>
      )}
      {canWrite ? (
        <form
          ref={form}
          className="space-y-3 border-t border-border p-3 sm:p-4"
          action={(data) =>
            run(
              () => postMessageAction(slug, { body: String(data.get("body") ?? "") }),
              () => form.current?.reset(),
            )
          }
        >
          <Notice tone="warning">{t("visibility")}</Notice>
          <label htmlFor={`${id}-body`} className="sr-only">
            {t("label")}
          </label>
          <textarea
            id={`${id}-body`}
            name="body"
            required
            maxLength={4000}
            rows={3}
            placeholder={t("placeholder")}
            className={cn(FIELD_CLASS, "resize-y py-2.5 leading-relaxed")}
          />
          <EngagementError error={error} />
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {t("send")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
