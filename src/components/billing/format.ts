import type { Currency } from "@/lib/domain/business";
import { toMinor } from "@/lib/money";

/** Calendar dates (YYYY-MM-DD) are shown as-is, never shifted by the viewer's timezone. */
export function formatDay(iso: string | null, locale: string): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** Today in the viewer's own calendar, for date input defaults. */
export function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Parses a major-unit input ("1500000", "12.5", "12,5") to minor units; null when invalid. */
export function parseMajor(raw: string, currency: Currency): number | null {
  const text = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const minor = toMinor(Number(text), currency);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
