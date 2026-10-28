"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { formatChatTime, formatStamp, formatTooltip } from "@/lib/format";

/**
 * A date and time in the visitor's own timezone. The server cannot know it (a host runs in UTC),
 * so the first paint is in UTC and the browser replaces it right after mounting. The full value
 * with its timezone, and how long ago it was, are in the tooltip. `time` is machine-readable.
 */
export function LocalTime({
  iso,
  className,
  dateOnly = false,
  compact = false,
}: {
  /** An ISO timestamp. */
  iso: string | Date;
  className?: string;
  dateOnly?: boolean;
  /** For a chat message: the time alone today, a short date and time on other days. */
  compact?: boolean;
}) {
  const locale = useLocale();
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const valid = !Number.isNaN(date.getTime());
  const render = (zone?: string) =>
    compact
      ? formatChatTime(date, locale, { timeZone: zone })
      : formatStamp(date, locale, { dateOnly, timeZone: zone });
  const [text, setText] = useState(() => (valid ? render("UTC") : ""));
  const [title, setTitle] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `date` is derived from `iso`
  useEffect(() => {
    if (!valid) return;
    setText(render());
    setTitle(formatTooltip(date, locale));
  }, [locale, valid, date.getTime(), dateOnly, compact]);

  if (!valid) return null;
  return (
    <time dateTime={date.toISOString()} title={title || undefined} className={className}>
      {text}
    </time>
  );
}
