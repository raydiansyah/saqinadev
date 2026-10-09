import type { Currency } from "@/lib/domain/business";
import { toMinor } from "@/lib/money";

/** Major-unit input ("1500000", "12,5") to minor units. Zero is allowed; null when invalid. */
export function parseAmount(raw: string, currency: Currency): number | null {
  const text = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (text === "") return 0;
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const minor = toMinor(Number(text), currency);
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Whole non-negative number from a form field; empty becomes `empty`. */
export function parseCount<T>(raw: FormDataEntryValue | null, empty: T): number | T {
  const text = String(raw ?? "").trim();
  if (text === "") return empty;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
}
