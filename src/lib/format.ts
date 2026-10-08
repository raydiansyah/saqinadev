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
