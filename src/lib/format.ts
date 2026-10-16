/** Relative time like "4 minutes ago" / "4 menit yang lalu", in the UI language. */
export function formatRelative(date: Date, locale: string, now: Date = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 45 * 60) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 22 * 3600) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 26 * 86400) return rtf.format(Math.round(seconds / 86400), "day");
  if (abs < 320 * 86400) return rtf.format(Math.round(seconds / (30 * 86400)), "month");
  return rtf.format(Math.round(seconds / (365 * 86400)), "year");
}

export function formatDateTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date);
}

/** Calendar-day key in the viewer's timezone-independent form (UTC), for grouping feeds. */
export const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/** A medium date, and the time unless `dateOnly`. Pass a `timeZone` to pin it (UTC on the server). */
export function formatStamp(
  date: Date,
  locale: string,
  options: { dateOnly?: boolean; timeZone?: string } = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(options.dateOnly ? {} : { timeStyle: "short" as const }),
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date);
}

/** The long form with seconds and the timezone name, and how long ago it was. */
export function formatTooltip(date: Date, locale: string, now: Date = new Date()): string {
  // dateStyle/timeStyle cannot be combined with a timezone name, so the parts are spelled out.
  const full = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return `${full} · ${formatRelative(date, locale, now)}`;
}
