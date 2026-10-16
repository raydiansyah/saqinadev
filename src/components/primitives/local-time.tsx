"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { formatStamp, formatTooltip } from "@/lib/format";

/**
 * A date and time in the visitor's own timezone. The server cannot know it (a host runs in UTC),
 * so the first paint is in UTC and the browser replaces it right after mounting. The full value
 * with its timezone, and how long ago it was, are in the tooltip. `time` is machine-readable.
 */
export function LocalTime({
  iso,
  className,
  dateOnly = false,
}: {
  /** An ISO timestamp. */
  iso: string | Date;
  className?: string;
  dateOnly?: boolean;
}) {
  const locale = useLocale();
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const valid = !Number.isNaN(date.getTime());
  const [text, setText] = useState(() =>
    valid ? formatStamp(date, locale, { dateOnly, timeZone: "UTC" }) : "",
  );
  const [title, setTitle] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `date` is derived from `iso`
  useEffect(() => {
    if (!valid) return;
    setText(formatStamp(date, locale, { dateOnly }));
    setTitle(formatTooltip(date, locale));
  }, [locale, valid, date.getTime(), dateOnly]);

  if (!valid) return null;
  return (
    <time dateTime={date.toISOString()} title={title || undefined} className={className}>
      {text}
    </time>
  );
}
