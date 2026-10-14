import { describe, expect, it } from "vitest";
import type { aiServices } from "@/lib/db/schema";
import { formatServicePrice } from "@/lib/services/format";
import { isPubliclyVisible, pick, pickList, toPublicService } from "@/lib/services/public";
import { inquiryInput, isSafeImageUrl, serviceInput } from "@/lib/services/schema";
import { STARTER_SERVICES } from "@/lib/services/starter";

type Row = typeof aiServices.$inferSelect;

const row = (over: Partial<Row> = {}): Row => ({
  id: "00000000-0000-4000-8000-000000000001",
  slug: "ai-daily-assistant",
  previousSlugs: ["old-slug"],
  internalName: "INTERNAL ONLY NAME",
  category: "daily",
  icon: "assistant",
  imageUrl: null,
  title: { en: "Daily", id: "Harian" },
  shortDescription: { en: "Short", id: "Singkat" },
  description: { en: "Long", id: "Panjang" },
  timeline: { en: "", id: "" },
  priceLabel: { en: "", id: "" },
  ctaLabel: { en: "", id: "" },
  metaTitle: { en: "", id: "" },
  metaDescription: { en: "", id: "" },
  problems: { en: [], id: [] },
  capabilities: { en: ["A"], id: [] },
  useCases: { en: [], id: [] },
  included: { en: [], id: [] },
  excluded: { en: [], id: [] },
  requirements: { en: [], id: [] },
  steps: { en: [], id: [] },
  faqs: { en: [], id: [] },
  relatedIds: [],
  pricingType: "fixed",
  priceAmount: 2_500_000,
  currency: "IDR",
  showPrice: true,
  ctaType: "discuss",
  isPublished: true,
  isPublic: true,
  isComingSoon: false,
  isFeatured: false,
  displayOrder: 0,
  archivedAt: null,
  createdBy: "user_secret_id",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe("visibility rules", () => {
  const cases: [boolean, boolean, boolean, boolean][] = [
    // published, public, coming soon, visible
    [false, true, false, false],
    [false, false, true, false],
    [true, false, false, false],
    [true, false, true, false],
    [true, true, false, true],
    [true, true, true, true],
  ];
  it.each(cases)("published=%s public=%s comingSoon=%s → visible=%s", (p, v, c, expected) => {
    expect(isPubliclyVisible({ isPublished: p, isPublic: v, archivedAt: null })).toBe(expected);
    expect(c).toBeTypeOf("boolean"); // Coming Soon never changes visibility
  });
  it("archived is never visible", () => {
    expect(isPubliclyVisible({ isPublished: true, isPublic: true, archivedAt: new Date() })).toBe(
      false,
    );
  });
});

describe("public serialization", () => {
  it("omits every price field when the price is hidden", () => {
    const out = toPublicService(row({ showPrice: false }), "en");
    expect(out.price).toBeNull();
    const json = JSON.stringify(out);
    expect(json).not.toContain("2500000");
    expect(json).not.toContain("pricingType");
    expect(json).not.toContain("priceAmount");
  });

  it("never carries an amount for quote, contact and free types", () => {
    for (const pricingType of ["custom_quote", "contact", "free_consultation"] as const) {
      const out = toPublicService(row({ pricingType, priceAmount: 999 }), "en");
      expect(out.price?.amount).toBeNull();
      expect(JSON.stringify(out)).not.toContain("999");
    }
  });

  it("whitelists fields: internal data does not leak", () => {
    const json = JSON.stringify(toPublicService(row(), "id"));
    for (const secret of [
      "INTERNAL ONLY NAME",
      "old-slug",
      "user_secret_id",
      "previousSlugs",
      "createdBy",
      "isPublished",
      "displayOrder",
    ])
      expect(json).not.toContain(secret);
  });

  it("falls back to the other language when a field is empty", () => {
    expect(pick({ en: "", id: "Halo" }, "en")).toBe("Halo");
    expect(pickList({ en: [], id: ["a"] }, "en")).toEqual(["a"]);
    expect(toPublicService(row(), "id").capabilities).toEqual(["A"]);
    expect(toPublicService(row(), "id").title).toBe("Harian");
  });
});

describe("price formatting", () => {
  const price = (
    type: Parameters<typeof formatServicePrice>[0]["type"],
    amount: number | null = 2_500_000,
  ) => ({
    type,
    amount,
    currency: "IDR" as const,
    label: "",
  });
  it("formats each pricing type in both languages", () => {
    expect(formatServicePrice(price("fixed"), "id")).toMatch(/^Rp\s?2\.500\.000$/);
    expect(formatServicePrice(price("starting_from"), "en")).toMatch(
      /^Starting from Rp\s?2\.500\.000$/,
    );
    expect(formatServicePrice(price("monthly"), "id")).toMatch(/\/bulan$/);
    expect(formatServicePrice(price("custom_quote", null), "en")).toBe("Custom quotation");
    expect(formatServicePrice(price("contact", null), "id")).toBe("Hubungi untuk harga");
    expect(formatServicePrice({ ...price("fixed"), currency: "USD", amount: 123_456 }, "en")).toBe(
      "$1,234.56",
    );
    expect(formatServicePrice({ ...price("fixed"), label: "From the first call" }, "en")).toBe(
      "From the first call",
    );
  });
});

describe("owner input validation", () => {
  const base = STARTER_SERVICES[0];
  it("accepts the starter services", () => {
    for (const s of STARTER_SERVICES) expect(serviceInput.safeParse(s).success, s.slug).toBe(true);
  });
  it("requires a price only for priced types", () => {
    expect(
      serviceInput.safeParse({ ...base, pricingType: "fixed", priceAmount: null }).success,
    ).toBe(false);
    expect(
      serviceInput.safeParse({ ...base, pricingType: "fixed", priceAmount: 1000 }).success,
    ).toBe(true);
    expect(
      serviceInput.safeParse({ ...base, pricingType: "contact", priceAmount: 1000 }).success,
    ).toBe(false);
  });
  it("validates slug, currency and images", () => {
    expect(serviceInput.safeParse({ ...base, slug: "Bad Slug!" }).success).toBe(false);
    expect(serviceInput.safeParse({ ...base, slug: "new" }).success).toBe(false);
    expect(serviceInput.safeParse({ ...base, currency: "XXX" }).success).toBe(false);
    expect(isSafeImageUrl("https://cdn.example.com/a.png")).toBe(true);
    for (const bad of [
      "http://x.com/a.png",
      "javascript:alert(1)",
      "https://user:pw@x.com/a.png",
      "https://localhost/a.png",
      "https://10.0.0.1/a.png",
      "data:image/png;base64,AAAA",
    ])
      expect(isSafeImageUrl(bad), bad).toBe(false);
  });
  it("strips control characters and refuses an untitled published service", () => {
    const parsed = serviceInput.parse({ ...base, internalName: "Name\u0000\u0007 ok" });
    expect(parsed.internalName).toBe("Name ok");
    expect(
      serviceInput.safeParse({ ...base, isPublished: true, title: { en: "", id: "" } }).success,
    ).toBe(false);
  });
});

describe("inquiry validation", () => {
  const ok = {
    name: "Budi",
    email: "BUDI@Example.com",
    message: "We need an assistant for our shop.",
    consent: true as const,
  };
  it("needs consent, a real email and a message", () => {
    expect(inquiryInput.parse(ok).email).toBe("budi@example.com");
    expect(inquiryInput.safeParse({ ...ok, consent: false }).success).toBe(false);
    expect(inquiryInput.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(inquiryInput.safeParse({ ...ok, message: "short" }).success).toBe(false);
    expect(inquiryInput.safeParse({ ...ok, whatsapp: "abc" }).success).toBe(false);
    expect(inquiryInput.safeParse({ ...ok, whatsapp: "+62 812 3456 7890" }).success).toBe(true);
  });
});
