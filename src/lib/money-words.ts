import { CURRENCY_DIGITS } from "@/lib/domain/business";

/**
 * Amounts in words, for the line "Terbilang" on a receipt. Whole major units only; the minor
 * part (cents) is written as a fraction by the caller. Indonesian follows the usual spelling
 * ("seratus", "seribu"); English uses short-scale names.
 */

const ID_UNITS = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];
const ID_SCALES = ["", "ribu", "juta", "miliar", "triliun"];

function idBelowThousand(n: number): string {
  if (n < 12) return ID_UNITS[n];
  if (n < 20) return `${ID_UNITS[n - 10]} belas`;
  if (n < 100)
    return `${ID_UNITS[Math.floor(n / 10)]} puluh${n % 10 ? ` ${ID_UNITS[n % 10]}` : ""}`;
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds === 1 ? "seratus" : `${ID_UNITS[hundreds]} ratus`;
  return rest ? `${head} ${idBelowThousand(rest)}` : head;
}

function idWords(n: number): string {
  if (n === 0) return "nol";
  const groups: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    // "seribu", not "satu ribu".
    parts.push(
      i === 1 && g === 1
        ? "seribu"
        : `${idBelowThousand(g)}${ID_SCALES[i] ? ` ${ID_SCALES[i]}` : ""}`,
    );
  }
  return parts.join(" ");
}

const EN_UNITS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const EN_TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];
const EN_SCALES = ["", "thousand", "million", "billion", "trillion"];

function enBelowThousand(n: number): string {
  if (n < 20) return EN_UNITS[n];
  if (n < 100) return `${EN_TENS[Math.floor(n / 10)]}${n % 10 ? `-${EN_UNITS[n % 10]}` : ""}`;
  const rest = n % 100;
  const head = `${EN_UNITS[Math.floor(n / 100)]} hundred`;
  return rest ? `${head} ${enBelowThousand(rest)}` : head;
}

function enWords(n: number): string {
  if (n === 0) return "zero";
  const groups: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    parts.push(`${enBelowThousand(groups[i])}${EN_SCALES[i] ? ` ${EN_SCALES[i]}` : ""}`);
  }
  return parts.join(" ");
}

/** The whole number in words, lower case. Negative, fractional or unsafe numbers are refused. */
export function amountInWords(value: number, locale: "id" | "en"): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Not a whole amount");
  return locale === "id" ? idWords(value) : enWords(value);
}

const CURRENCY_NAMES: Record<string, { id: string; en: string }> = {
  IDR: { id: "rupiah", en: "rupiah" },
  USD: { id: "dolar AS", en: "US dollars" },
  SGD: { id: "dolar Singapura", en: "Singapore dollars" },
  MYR: { id: "ringgit", en: "ringgit" },
  EUR: { id: "euro", en: "euros" },
  AUD: { id: "dolar Australia", en: "Australian dollars" },
};

/**
 * "dua juta lima ratus ribu rupiah", or with a minor unit "ten US dollars and 50/100". The
 * amount is in the currency's minor unit, as stored.
 */
export function receiptWords(
  amountMinor: number,
  currency: keyof typeof CURRENCY_DIGITS,
  locale: "id" | "en",
): string {
  const digits = CURRENCY_DIGITS[currency];
  const factor = 10 ** digits;
  const major = Math.floor(amountMinor / factor);
  const minor = amountMinor % factor;
  const name = CURRENCY_NAMES[currency]?.[locale] ?? currency;
  const base = `${amountInWords(major, locale)} ${name}`;
  if (minor === 0) return base;
  return `${base} ${locale === "id" ? "dan" : "and"} ${String(minor).padStart(digits, "0")}/${factor}`;
}
