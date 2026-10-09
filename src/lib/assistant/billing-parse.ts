import type { Currency } from "@/lib/domain/business";
import { parseMoneyText, toMinor } from "@/lib/money";

/**
 * Reads a payment arrangement from plain language (pure):
 * "harga 25 juta, DP 40%, sisanya dua termin" → value 25.000.000, DP 40%, 30%, 30%.
 * Anything it cannot read is reported as missing, never guessed.
 */

export interface ParsedTerm {
  kind: "dp" | "installment" | "final";
  percentBp: number;
}

export interface ParsedBilling {
  /** Minor units, or null when no amount was found. */
  value: number | null;
  terms: ParsedTerm[] | null;
}

const COUNT_WORDS: Record<string, number> = {
  satu: 1,
  one: 1,
  dua: 2,
  two: 2,
  tiga: 3,
  three: 3,
  empat: 4,
  four: 4,
  lima: 5,
  five: 5,
};

const DP = /\b(dp|down ?payment|uang muka|deposit)\b/;
const REST =
  /\b(sisa(?:nya)?|rest|remaining|remainder|selebihnya|kemudian|then|lalu)\b[^.]*?\b(\d|satu|dua|tiga|empat|lima|one|two|three|four|five)\b\s*(?:x\s*)?(termin|kali|installments?|tahap|payments?|cicilan)/;
const REST_SINGLE = /\b(sisa(?:nya)?|rest|remaining|pelunasan|final)\b/;
const FULL = /\b(bayar penuh|lunas di ?awal|full payment|paid in full|100%)\b/;

function splitEven(totalBp: number, n: number): number[] {
  const each = Math.floor(totalBp / n);
  const parts = Array.from({ length: n }, () => each);
  parts[n - 1] += totalBp - each * n;
  return parts;
}

export function parseBillingText(input: string, currency: Currency): ParsedBilling {
  const text = input.toLowerCase().replace(/\s+/g, " ");
  // Percentages are removed before reading the amount so "40%" is never taken as money.
  const withoutPercents = text.replace(/\d{1,3}(?:[.,]\d+)?\s*%/g, " ");
  const money = parseMoneyText(withoutPercents);
  const value = money ? toMinor(money.amount, money.currency ?? currency) : null;

  if (FULL.test(text)) return { value, terms: [{ kind: "final", percentBp: 10_000 }] };

  const percents = [...text.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)].map((m) => ({
    bp: Math.round(Number(m[1].replace(",", ".")) * 100),
    index: m.index ?? 0,
  }));
  if (percents.length === 0 || percents.some((p) => p.bp <= 0 || p.bp > 10_000))
    return { value, terms: null };

  const terms: ParsedTerm[] = percents.map((p, i) => {
    const before = text.slice(Math.max(0, p.index - 20), p.index);
    return { kind: i === 0 && DP.test(before) ? "dp" : "installment", percentBp: p.bp };
  });
  const used = terms.reduce((a, t) => a + t.percentBp, 0);
  if (used > 10_000) return { value, terms: null };

  if (used < 10_000) {
    const rest = text.match(REST);
    const count = rest ? (COUNT_WORDS[rest[2]] ?? Number(rest[2])) : REST_SINGLE.test(text) ? 1 : 0;
    if (!count || count > 12) return { value, terms: null };
    for (const bp of splitEven(10_000 - used, count))
      terms.push({ kind: "installment", percentBp: bp });
  }
  if (terms.length > 1 && terms[terms.length - 1].kind === "installment")
    terms[terms.length - 1] = { ...terms[terms.length - 1], kind: "final" };
  return { value, terms };
}
