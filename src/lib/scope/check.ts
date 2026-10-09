import type { ScopeCategory } from "@/lib/domain/business";

/**
 * Pure scope matching. Compares a request ("tambahkan payment gateway") with the project's
 * scope items by normalised word overlap. It only reports what the recorded scope says; it
 * never decides that something is in scope when nothing matches.
 */

export interface ScopeItemLike {
  id: string;
  title: string;
  description?: string;
  category: ScopeCategory;
}

export type ScopeVerdict =
  | { status: "unknown"; item: null }
  | { status: ScopeCategory; item: ScopeItemLike; score: number };

const STOPWORDS = new Set(
  (
    "a an the and or of for to with in on is are be add create make new feature features " +
    "please can could would it this that me us our my " +
    "tambah tambahkan buat buatkan bikin fitur yang dan atau untuk dengan di ke dari ini itu " +
    "apakah apa bisa tolong mau ingin kami saya termasuk scope include included juga ada sudah"
  ).split(" "),
);

/** Indonesian words mapped onto the English form, so mixed-language scope still matches. */
const SYNONYMS: Record<string, string> = {
  pembayaran: "payment",
  bayar: "payment",
  laporan: "report",
  reports: "report",
  pengguna: "user",
  users: "user",
  produk: "product",
  products: "product",
  keranjang: "cart",
  notifikasi: "notification",
  notifications: "notification",
  aplikasi: "app",
  application: "app",
  seluler: "mobile",
  wa: "whatsapp",
  integrasi: "integration",
  integrations: "integration",
  pesanan: "order",
  orders: "order",
  diskon: "discount",
  kupon: "voucher",
  vouchers: "voucher",
  masuk: "login",
  signin: "login",
};

export function scopeTokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => SYNONYMS[w] ?? w);
  return [...new Set(words)];
}

// When two items match equally well, the more restrictive answer wins.
const CAUTION: Record<ScopeCategory, number> = { excluded: 3, future: 2, optional: 1, included: 0 };

export function checkScope(request: string, items: ScopeItemLike[]): ScopeVerdict {
  const wanted = new Set(scopeTokens(request));
  if (wanted.size === 0) return { status: "unknown", item: null };
  let best: { item: ScopeItemLike; score: number } | null = null;
  for (const item of items) {
    const tokens = scopeTokens(item.title);
    if (tokens.length === 0) continue;
    const hits = tokens.filter((t) => wanted.has(t)).length;
    if (hits === 0) continue;
    const score = hits / tokens.length;
    if (score < 0.5) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && CAUTION[item.category] > CAUTION[best.item.category])
    )
      best = { item, score };
  }
  if (!best) return { status: "unknown", item: null };
  return { status: best.item.category, item: best.item, score: best.score };
}
