import { CURRENCY_DIGITS, type Currency } from "@/lib/domain/business";

/**
 * Money helpers. Amounts are stored as integers in the currency's minor unit (IDR has no
 * minor unit, USD has cents) so arithmetic never touches floating point.
 */

export const isCurrency = (value: string): value is Currency => value in CURRENCY_DIGITS;

export function toMinor(major: number, currency: Currency): number {
  return Math.round(major * 10 ** CURRENCY_DIGITS[currency]);
}

export function fromMinor(minor: number, currency: Currency): number {
  return minor / 10 ** CURRENCY_DIGITS[currency];
}

export function formatMoney(minor: number, currency: Currency, locale = "en"): string {
  const digits = CURRENCY_DIGITS[currency];
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .format(fromMinor(minor, currency))
    .replace(/ /g, " ");
}

const MULTIPLIERS: [RegExp, number][] = [
  [/^(miliar|milyar|m|b|bn|billion)$/, 1e9],
  [/^(juta|jt|million|mio)$/, 1e6],
  [/^(ribu|rb|k|thousand)$/, 1e3],
];

/** "25.000.000" / "25,000,000" are thousands; "1,5" / "2.50" are decimals. */
function parseNumber(raw: string, hasMultiplier: boolean): number | null {
  const text = raw.replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(text)) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(text) && !hasMultiplier)
    return Number(text.replace(/[.,]/g, ""));
  const decimal = text.match(/^(\d+)[.,](\d+)$/);
  if (decimal) return Number(`${decimal[1]}.${decimal[2]}`);
  if (/^\d+$/.test(text)) return Number(text);
  // Mixed separators, e.g. 1.250.000,50 or 1,250,000.50: the last separator is the decimal.
  const last = Math.max(text.lastIndexOf("."), text.lastIndexOf(","));
  const whole = text.slice(0, last).replace(/[.,]/g, "");
  return Number(`${whole}.${text.slice(last + 1)}`);
}

export interface ParsedMoney {
  /** Major units (25 juta = 25000000). */
  amount: number;
  currency: Currency | null;
}

const MONEY_PATTERN =
  /(rp\.?|idr|usd|us\$|\$|sgd|myr|rm|eur|€|aud)?\s*(\d[\d.,]*)\s*(miliar|milyar|juta|jt|ribu|rb|million|mio|thousand|bn|billion|k|m|b)?\b/i;

const CURRENCY_MARKS: Record<string, Currency> = {
  rp: "IDR",
  "rp.": "IDR",
  idr: "IDR",
  usd: "USD",
  us$: "USD",
  $: "USD",
  sgd: "SGD",
  myr: "MYR",
  rm: "MYR",
  eur: "EUR",
  "€": "EUR",
  aud: "AUD",
};

/**
 * Reads the first amount in free text: "25 juta", "Rp25.000.000", "1,5jt", "$2,000", "500rb".
 * Returns null when there is no amount; never guesses one.
 */
export function parseMoneyText(input: string): ParsedMoney | null {
  const match = input.toLowerCase().match(MONEY_PATTERN);
  if (!match) return null;
  const [, mark, digits, unit] = match;
  // A bare small number with no currency or unit ("2 termin", "40%") is not money.
  if (!mark && !unit && /^\d{1,3}$/.test(digits)) return null;
  const multiplier = unit ? (MULTIPLIERS.find(([re]) => re.test(unit))?.[1] ?? 1) : 1;
  const value = parseNumber(digits.replace(/[.,]$/, ""), Boolean(unit));
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return { amount: value * multiplier, currency: mark ? (CURRENCY_MARKS[mark] ?? null) : null };
}

/**
 * Splits a total by basis points. Every share is floored and the last one absorbs the
 * rounding, so the parts always add up to the total exactly when the percentages sum to 100%.
 */
export function splitByPercent(total: number, bps: number[]): number[] {
  const parts = bps.map((bp) => Math.floor((total * bp) / 10_000));
  const sum = bps.reduce((a, b) => a + b, 0);
  if (sum === 10_000 && parts.length > 0) {
    parts[parts.length - 1] = total - parts.slice(0, -1).reduce((a, b) => a + b, 0);
  }
  return parts;
}

/** 4000 → "40%", 3333 → "33.33%". */
export const formatPercent = (bp: number) =>
  `${Number.isInteger(bp / 100) ? bp / 100 : (bp / 100).toFixed(2)}%`;
