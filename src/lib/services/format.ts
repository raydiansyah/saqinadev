import { formatMoney } from "@/lib/money";
import type { PublicPrice } from "./public";

const WORDS = {
  en: {
    from: "Starting from",
    month: "/month",
    quote: "Custom quotation",
    free: "Free consultation",
    contact: "Contact for pricing",
  },
  id: {
    from: "Mulai dari",
    month: "/bulan",
    quote: "Penawaran khusus",
    free: "Konsultasi gratis",
    contact: "Hubungi untuk harga",
  },
} as const;

/** Rupiah always reads the Indonesian way (Rp2.500.000), whatever the page language. */
const money = (amount: number, currency: PublicPrice["currency"], locale: "en" | "id") =>
  formatMoney(amount, currency, currency === "IDR" ? "id" : locale);

/** The price line shown to visitors. A custom label from the Owner wins over the default text. */
export function formatServicePrice(price: PublicPrice, locale: "en" | "id"): string {
  const w = WORDS[locale];
  if (price.label) return price.label;
  switch (price.type) {
    case "custom_quote":
      return w.quote;
    case "free_consultation":
      return w.free;
    case "contact":
      return w.contact;
    case "fixed":
      return price.amount === null ? w.contact : money(price.amount, price.currency, locale);
    case "starting_from":
      return price.amount === null
        ? w.contact
        : `${w.from} ${money(price.amount, price.currency, locale)}`;
    case "monthly":
      return price.amount === null
        ? w.contact
        : `${money(price.amount, price.currency, locale)}${w.month}`;
  }
}
