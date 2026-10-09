"use client";

import { useTranslations } from "next-intl";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/errors";
import { cn } from "@/lib/utils";

export type MarkReadAction = (id?: string) => Promise<ActionResult<void>>;

export interface NotificationItem {
  id: string;
  href: string | null;
  unread: boolean;
  title: string;
  body: string;
  time: string;
  iso: string;
}

/** Clicking an item marks it read, then opens its target. */
export function NotificationItems({
  items,
  markRead,
}: {
  items: NotificationItem[];
  markRead: MarkReadAction;
}) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const { pending, error, run } = useRun();
  const hasUnread = items.some((i) => i.unread);

  const open = (item: NotificationItem) =>
    run(
      () =>
        item.unread ? markRead(item.id) : Promise.resolve({ ok: true as const, data: undefined }),
      () => {
        if (item.href) router.push(item.href);
      },
    );

  return (
    <div>
      {hasUnread ? (
        <div className="mb-4 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => markRead())}
          >
            {t("markAllRead")}
          </Button>
        </div>
      ) : null}
      <FormError error={error} />
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => open(item)}
              className={cn(
                "flex w-full min-w-0 cursor-pointer items-start gap-3 px-4 py-3 text-left hover:bg-surface-raised disabled:cursor-wait",
                item.unread && "bg-surface",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  item.unread ? "bg-primary" : "bg-transparent",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span
                    className={cn("break-words", item.unread ? "font-semibold" : "font-medium")}
                  >
                    {item.title}
                    {item.unread ? <span className="sr-only"> ({t("unread")})</span> : null}
                  </span>
                  <time dateTime={item.iso} className="text-xs text-muted-foreground">
                    {item.time}
                  </time>
                </span>
                {item.body ? (
                  <span className="mt-0.5 block text-sm break-words text-muted-foreground">
                    {item.body}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
