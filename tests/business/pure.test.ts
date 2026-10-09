import { describe, expect, it } from "vitest";
import {
  addDays,
  effectiveStatus,
  invoiceNumber,
  resolveTermAmounts,
  statusAfterPayments,
} from "@/lib/billing/rules";
import { formatMoney, parseMoneyText, splitByPercent, toMinor } from "@/lib/money";
import { clientProgress } from "@/lib/portal/progress";
import { checkScope } from "@/lib/scope/check";

describe("money", () => {
  it.each([
    ["harga 25 juta", 25_000_000, null],
    ["Rp25.000.000", 25_000_000, "IDR"],
    ["Rp 25.000.000,-", 25_000_000, "IDR"],
    ["1,5jt", 1_500_000, null],
    ["1.5 juta", 1_500_000, null],
    ["500rb", 500_000, null],
    ["$2,000", 2_000, "USD"],
    ["USD 1,250.50", 1_250.5, "USD"],
    ["2 miliar", 2_000_000_000, null],
  ])("parses %s", (text, amount, currency) => {
    expect(parseMoneyText(text)).toEqual({ amount, currency });
  });

  it("does not read small bare numbers as money", () => {
    expect(parseMoneyText("sisanya 2 termin")).toBeNull();
    expect(parseMoneyText("tidak ada angka")).toBeNull();
  });

  it("converts to minor units per currency", () => {
    expect(toMinor(25_000_000, "IDR")).toBe(25_000_000);
    expect(toMinor(12.34, "USD")).toBe(1234);
  });

  it("formats without breaking spaces surprises", () => {
    expect(formatMoney(25_000_000, "IDR", "id")).toMatch(/^Rp\s?25\.000\.000$/);
    expect(formatMoney(123_456, "USD", "en")).toBe("$1,234.56");
  });

  it("splits by percent and keeps the total exact", () => {
    expect(splitByPercent(25_000_000, [4000, 3000, 3000])).toEqual([
      10_000_000, 7_500_000, 7_500_000,
    ]);
    const parts = splitByPercent(100, [3333, 3333, 3334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("billing rules", () => {
  const base = { total: 1000, amountPaid: 0, dueDate: "2026-10-01" };

  it("derives overdue only for open invoices past due", () => {
    expect(effectiveStatus({ ...base, status: "issued" }, "2026-10-02")).toBe("overdue");
    expect(effectiveStatus({ ...base, status: "partially_paid" }, "2026-10-02")).toBe("overdue");
    expect(effectiveStatus({ ...base, status: "issued" }, "2026-10-01")).toBe("issued");
    expect(effectiveStatus({ ...base, status: "paid" }, "2026-12-01")).toBe("paid");
    expect(effectiveStatus({ ...base, status: "draft" }, "2026-12-01")).toBe("draft");
  });

  it("moves status with payments", () => {
    expect(statusAfterPayments("issued", 1000, 400, false)).toBe("partially_paid");
    expect(statusAfterPayments("partially_paid", 1000, 1000, true)).toBe("paid");
    expect(statusAfterPayments("paid", 1000, 0, true)).toBe("sent");
    expect(statusAfterPayments("paid", 1000, 0, false)).toBe("issued");
    expect(statusAfterPayments("cancelled", 1000, 0, false)).toBe("cancelled");
  });

  it("resolves term amounts and rejects mismatches", () => {
    expect(
      resolveTermAmounts(25_000_000, [
        { label: "DP", percentBp: 4000 },
        { label: "T1", percentBp: 3000 },
        { label: "Final", percentBp: 3000 },
      ]),
    ).toEqual([10_000_000, 7_500_000, 7_500_000]);
    expect(resolveTermAmounts(1000, [{ label: "A", percentBp: 5000 }])).toBeNull();
    expect(
      resolveTermAmounts(1000, [
        { label: "A", amount: 400 },
        { label: "B", amount: 600 },
      ]),
    ).toEqual([400, 600]);
    // Remaining terms after an invoiced 40% DP: percentages still refer to the whole value.
    expect(
      resolveTermAmounts(
        1000,
        [
          { label: "B", percentBp: 3000 },
          { label: "C", percentBp: 3000 },
        ],
        600,
      ),
    ).toEqual([300, 300]);
  });

  it("formats invoice numbers and adds days", () => {
    expect(invoiceNumber(2026, 7)).toBe("INV-2026-007");
    expect(addDays("2026-10-25", 14)).toBe("2026-11-08");
  });
});

describe("scope check", () => {
  const items = [
    { id: "1", title: "Payment gateway", category: "excluded" as const },
    { id: "2", title: "Product management", category: "included" as const },
    { id: "3", title: "Mobile application", category: "future" as const },
    { id: "4", title: "Discount voucher", category: "optional" as const },
  ];

  it("finds excluded items in Indonesian and English requests", () => {
    expect(checkScope("Tambahkan payment gateway", items)).toMatchObject({
      status: "excluded",
      item: { id: "1" },
    });
    expect(checkScope("bisa tambah gateway pembayaran?", items).status).toBe("excluded");
  });

  it("reports included, future and optional items", () => {
    expect(checkScope("Apakah product management termasuk?", items).status).toBe("included");
    expect(checkScope("aplikasi mobile", items).status).toBe("future");
    expect(checkScope("fitur voucher", items).status).toBe("optional");
  });

  it("says unknown when nothing matches", () => {
    expect(checkScope("WhatsApp integration", items)).toEqual({ status: "unknown", item: null });
  });
});

describe("client progress", () => {
  const ms = [
    { id: "a", title: "Requirement", clientTitle: null, clientVisible: true },
    { id: "b", title: "Internal infra", clientTitle: null, clientVisible: false },
    { id: "c", title: "Build core", clientTitle: "Development", clientVisible: true },
    { id: "d", title: "Handover", clientTitle: null, clientVisible: true },
  ];
  const ts = [
    { milestoneId: "a", status: "done" },
    { milestoneId: "b", status: "done" },
    { milestoneId: "c", status: "in_progress" },
    { milestoneId: "c", status: "done" },
    { milestoneId: "d", status: "todo" },
  ];

  it("lists visible stages with plain names and computes the percentage", () => {
    const p = clientProgress(ms, ts);
    expect(p.percent).toBe(60);
    expect(p.stages).toEqual([
      { title: "Requirement", state: "done" },
      { title: "Development", state: "current" },
      { title: "Handover", state: "upcoming" },
    ]);
    expect(p.current).toBe("Development");
    expect(p.next).toBe("Handover");
  });
});
