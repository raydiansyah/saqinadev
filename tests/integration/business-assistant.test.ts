import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { MockAiProvider } from "@/lib/ai/mock";
import { parseBillingText } from "@/lib/assistant/billing-parse";
import type { StreamEvent } from "@/lib/assistant/blocks";
import { classifyWithRules } from "@/lib/assistant/intents/rules";
import { handleMessage } from "@/lib/assistant/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { transitionInvoice } from "@/lib/billing/invoices";
import { recordPayment } from "@/lib/billing/payments";
import { listTerms } from "@/lib/billing/terms";
import { db } from "@/lib/db/client";
import { changeRequests, documents, invoices, requirements, scopeItems } from "@/lib/db/schema";
import { listProposals } from "@/lib/proposals/repository";
import { approveProposal } from "@/lib/proposals/service";
import { createScopeItem } from "@/lib/scope/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const provider = new MockAiProvider();
let owner: Actor;
let slug: string;

async function say(content: string, locale: "en" | "id" = "id") {
  const events: StreamEvent[] = [];
  await handleMessage(
    owner,
    slug,
    { clientId: randomUUID(), content, locale },
    (e) => events.push(e),
    { provider },
  );
  return {
    text: events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join(""),
    blocks: events.flatMap((e) => (e.type === "block" ? [e.block] : [])),
  };
}

async function approveLatest() {
  const access = await loadProjectAccess(owner, { slug }, "project:read");
  const [pending] = (await listProposals(access)).filter((p) => p.status === "pending");
  expect(pending).toBeDefined();
  await approveProposal(owner, slug, { proposalId: pending.id });
  return access;
}

describe("business intents (rules)", () => {
  it.each([
    ["Harga 25 juta, DP 40%, sisanya dua termin", "SETUP_BILLING"],
    ["Buatkan invoice DP", "CREATE_INVOICE"],
    ["Buatkan fitur invoice untuk kasir", "ADD_FEATURE"],
    ["Berapa yang belum lunas?", "ASK_BILLING"],
    ["Client ini sudah bayar?", "ASK_BILLING"],
    ["Apakah fitur voucher termasuk scope?", "ASK_SCOPE"],
    ["Apa saja fitur yang termasuk?", "ASK_SCOPE"],
    ["Tambahkan hosting ke excluded", "ADD_SCOPE_ITEM"],
    ["Tambahkan payment gateway", "ADD_FEATURE"],
  ])("%s → %s", (text, intent) => {
    expect(classifyWithRules(text).intent).toBe(intent);
  });

  it("reads payment arrangements", () => {
    expect(parseBillingText("harga 25 juta DP 40% sisanya dua termin", "IDR")).toEqual({
      value: 25_000_000,
      terms: [
        { kind: "dp", percentBp: 4000 },
        { kind: "installment", percentBp: 3000 },
        { kind: "final", percentBp: 3000 },
      ],
    });
    expect(parseBillingText("DP 50%, pelunasan 50%", "IDR").value).toBeNull();
    expect(parseBillingText("nilai 10 juta dp 30%", "IDR").terms).toBeNull();
  });
});

describe("business assistant", () => {
  beforeAll(async () => {
    await resetDatabase();
    owner = await createUser("Owner");
    slug = await project(owner, "A restaurant point of sale app for my cafe with stock.");
  });

  it("sets up billing through a proposal and answers from records only", async () => {
    let reply = await say("Harga project 25 juta, DP 40%, sisanya dua termin");
    expect(reply.blocks.some((b) => b.type === "proposal")).toBe(true);
    const access = await approveLatest();
    const terms = await listTerms(access.project.id);
    expect(terms.map((t) => [t.label, t.amount])).toEqual([
      ["DP", 10_000_000],
      ["Termin 2", 7_500_000],
      ["Pelunasan", 7_500_000],
    ]);

    reply = await say("Buatkan invoice DP");
    await approveLatest();
    const [draft] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.projectId, access.project.id));
    expect(draft).toMatchObject({ status: "draft", total: 10_000_000, termId: terms[0].id });

    await transitionInvoice(owner, slug, draft.id, "issue");
    await recordPayment(owner, slug, draft.id, {
      amount: 4_000_000,
      paidAt: "2026-01-02",
      method: "bank_transfer",
    });
    reply = await say("Berapa yang belum lunas?");
    const findings = reply.blocks.flatMap((b) => (b.type === "analysis" ? b.findings : []));
    const texts = findings.map((f) => f.text).join("\n");
    expect(texts).toContain("10.000.000");
    expect(texts).toContain("4.000.000");
    expect(texts).toContain("6.000.000");
    expect(findings.every((f) => f.source === "billing")).toBe(true);
  });

  it("refuses to add an excluded feature silently and answers scope questions", async () => {
    await createScopeItem(owner, slug, { title: "Payment gateway", category: "excluded" });
    const before = await db.select().from(requirements);
    // An excluded feature becomes a change request proposal, never a requirement or task.
    await say("Tambahkan payment gateway");
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const [proposal] = (await listProposals(access)).filter((p) => p.status === "pending");
    expect(proposal.description).toContain("di luar scope");
    expect(proposal.actions.map((a) => a.type)).toEqual(["CREATE_CHANGE_REQUEST"]);
    await approveLatest();
    const crs = await db.select().from(changeRequests);
    expect(crs).toMatchObject([
      { status: "draft", additionalCost: 0, scopeStatus: "out_of_scope" },
    ]);
    expect(await db.select().from(requirements)).toHaveLength(before.length);

    const scope = await say("Apakah fitur payment gateway termasuk scope?");
    expect(scope.text).toContain("Tidak termasuk");

    await say("Tambahkan hosting ke excluded");
    await approveLatest();
    const items = await db.select().from(scopeItems).where(eq(scopeItems.title, "Hosting"));
    expect(items[0]?.category).toBe("excluded");
  });
});

describe("billing clarification", () => {
  beforeAll(async () => {
    await resetDatabase();
    owner = await createUser("Owner");
    slug = await project(owner, "A restaurant point of sale app for my cafe with stock.");
  });

  it("asks for the missing terms and keeps the value from the first message", async () => {
    const ask = await say("Harga project 20 juta, pakai termin ya");
    expect(ask.blocks.some((b) => b.type === "question")).toBe(true);
    const reply = await say("DP 50%, pelunasan 50%");
    expect(reply.blocks.some((b) => b.type === "proposal")).toBe(true);
    const access = await approveLatest();
    expect((await listTerms(access.project.id)).map((t) => t.amount)).toEqual([
      10_000_000, 10_000_000,
    ]);
  });
});

describe("engagement intents", () => {
  beforeAll(async () => {
    await resetDatabase();
    owner = await createUser("Owner");
    slug = await project(owner, "A restaurant point of sale app for my cafe with stock.");
  });

  it.each([
    ["Buatkan proposal untuk project ini", "GENERATE_DOCUMENT"],
    ["Siapkan draft perjanjian", "GENERATE_DOCUMENT"],
    ["Kapan maintenance habis?", "ASK_MAINTENANCE"],
    ["Ingatkan client soal pembayaran", "REMIND_CLIENT"],
    ["Buat change request untuk integrasi WhatsApp", "CREATE_CHANGE_REQUEST"],
  ])("%s → %s", (text, intent) => {
    expect(classifyWithRules(text).intent).toBe(intent);
  });

  it("generates a document after approval and asks which one when unclear", async () => {
    const ask = await say("Buatkan dokumen kontrak", "id");
    expect(ask.blocks.some((b) => b.type === "proposal")).toBe(true);
    await approveLatest();
    const docs = await db.select().from(documents).where(eq(documents.slug, "agreement"));
    expect(docs[0]).toMatchObject({ status: "draft", type: "agreement" });

    const reply = await say("Ingatkan client soal invoice");
    expect(reply.text).toMatch(/portal/);
  });
});
