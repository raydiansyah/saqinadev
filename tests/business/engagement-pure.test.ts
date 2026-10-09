import { describe, expect, it } from "vitest";
import { renderBusinessDoc } from "@/lib/documents/business-templates";
import { daysUntil, renewalPeriod, suggestClassification } from "@/lib/maintenance/classify";
import { DEFAULT_RULES, pickRule, windowKey } from "@/lib/reminders/rules";

const rules = DEFAULT_RULES.map((r, i) => ({ ...r, id: String(i), enabled: true }));

describe("reminder timing", () => {
  it("fires the latest reached offset before a due date, and nothing after it", () => {
    expect(pickRule(rules, "invoice_due", "2026-10-20", "2026-10-10")).toBeNull();
    expect(pickRule(rules, "invoice_due", "2026-10-20", "2026-10-13")?.offsetDays).toBe(-7);
    // Cron was down for a week: one reminder (the latest), not three.
    expect(pickRule(rules, "invoice_due", "2026-10-20", "2026-10-19")?.offsetDays).toBe(-3);
    expect(pickRule(rules, "invoice_due", "2026-10-20", "2026-10-20")?.offsetDays).toBe(0);
    expect(pickRule(rules, "invoice_due", "2026-10-20", "2026-10-21")).toBeNull();
  });

  it("fires overdue and pending reminders after the anchor", () => {
    expect(pickRule(rules, "invoice_overdue", "2026-10-20", "2026-10-20")).toBeNull();
    expect(pickRule(rules, "invoice_overdue", "2026-10-20", "2026-10-21")?.offsetDays).toBe(1);
    expect(pickRule(rules, "invoice_overdue", "2026-10-20", "2026-11-30")?.offsetDays).toBe(7);
    expect(pickRule(rules, "approval_pending", "2026-10-01", "2026-10-02")).toBeNull();
    expect(pickRule(rules, "approval_pending", "2026-10-01", "2026-10-04")?.offsetDays).toBe(3);
  });

  it("respects disabled rules and builds stable dedup keys", () => {
    const off = rules.map((r) => (r.kind === "invoice_overdue" ? { ...r, enabled: false } : r));
    expect(pickRule(off, "invoice_overdue", "2026-10-20", "2026-10-25")).toBeNull();
    expect(windowKey("2026-10-20", -3)).toBe("2026-10-20:-3");
  });
});

describe("maintenance classification", () => {
  const plans = [{ startDate: "2026-11-01", endDate: "2027-10-31", status: "active" }];

  it("separates warranty, included maintenance and paid work", () => {
    const base = { warrantyUntil: "2026-11-30", plans };
    expect(suggestClassification({ ...base, kind: "bug", date: "2026-11-10" })).toBe("warranty");
    expect(suggestClassification({ ...base, kind: "maintenance", date: "2026-11-10" })).toBe(
      "included",
    );
    expect(suggestClassification({ ...base, kind: "bug", date: "2027-12-01" })).toBe("paid");
    expect(suggestClassification({ ...base, kind: "feature", date: "2026-10-01" })).toBe("paid");
    expect(suggestClassification({ ...base, kind: "question", date: "2028-01-01" })).toBe(
      "included",
    );
  });

  it("computes renewal periods and remaining days", () => {
    expect(renewalPeriod("2026-11-01", "2027-10-31")).toEqual({
      start: "2027-11-01",
      end: "2028-10-31",
    });
    expect(daysUntil("2026-10-23", "2026-10-09")).toBe(14);
  });
});

describe("business documents", () => {
  const input = {
    locale: "id" as const,
    today: "2026-10-09",
    org: "Studio Abati",
    client: { name: "Budi", company: "PT Rasa Nusantara" },
    project: { name: "Restaurant POS", description: "POS untuk restoran.", objective: null },
    currency: "IDR" as const,
    value: 25_000_000,
    scope: [
      { title: "Login", description: "", category: "included" as const },
      { title: "Payment gateway", description: "", category: "excluded" as const },
    ],
    terms: [{ label: "DP", amount: 10_000_000, dueDate: "2026-10-10" }],
    milestones: [{ title: "Foundation", goal: "" }],
    warrantyUntil: null,
    plan: null,
  };

  it("uses only recorded facts and leaves visible placeholders", () => {
    const { content } = renderBusinessDoc("agreement", input);
    expect(content).toContain("PT Rasa Nusantara");
    expect(content).toContain("- Payment gateway");
    expect(content).toContain("25.000.000");
    expect(content).toContain("[MASA GARANSI]");
    expect(content).toContain("bukan nasihat hukum");
    expect(content).not.toContain("—");
  });

  it("marks missing values instead of inventing them", () => {
    const { content } = renderBusinessDoc("maintenance_agreement", { ...input, locale: "en" });
    expect(content).toContain("[FEE]");
    expect(content).toContain("[PERIOD]");
    const proposal = renderBusinessDoc("proposal", { ...input, value: null, locale: "en" });
    expect(proposal.content).toContain("[TO BE AGREED]");
  });
});
