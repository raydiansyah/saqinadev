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

/** The language tag dates are written in: "27 Februari 2027" in Indonesian, "27 February 2027" in English. */
export const dateTag = (locale: string) => (locale === "id" ? "id-ID" : "en-GB");

/**
 * A calendar date, month in full: "27 Februari 2027". Takes a Date or an ISO calendar date
 * ("2027-02-27"); either is read in UTC so the day never shifts with the viewer's timezone.
 */
export function formatLongDate(value: Date | string, locale: string): string {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(dateTag(locale), { dateStyle: "long", timeZone: "UTC" }).format(
    date,
  );
}

export function formatDateTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(dateTag(locale), { dateStyle: "long", timeStyle: "short" }).format(
    date,
  );
}

export function formatTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date);
}

/** Calendar-day key in the viewer's timezone-independent form (UTC), for grouping feeds. */
export const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/** A long date, and the time unless `dateOnly`. Pass a `timeZone` to pin it (UTC on the server). */
export function formatStamp(
  date: Date,
  locale: string,
  options: { dateOnly?: boolean; timeZone?: string } = {},
): string {
  return new Intl.DateTimeFormat(dateTag(locale), {
    dateStyle: "long",
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
