import { describe, expect, it } from "vitest";
import {
  type Candidate,
  type ChatMessage,
  explicitCandidates,
  groundCandidates,
  jaccard,
  selectWindow,
  support,
} from "@/lib/memory/extract/plan";

const msg = (id: string, role: "user" | "assistant", content: string): ChatMessage => ({
  id,
  role,
  content,
});

describe("extraction window", () => {
  const all = ["a", "b", "c", "d", "e"].map((id) => msg(id, "user", id));
  it("starts after the last message already read", () => {
    expect(selectWindow(all, "b").map((m) => m.id)).toEqual(["c", "d", "e"]);
    expect(selectWindow(all, null).map((m) => m.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(selectWindow(all, "e")).toEqual([]);
  });
  it("is capped to the most recent messages", () => {
    expect(selectWindow(all, null, 2).map((m) => m.id)).toEqual(["d", "e"]);
  });
});

describe("explicit statements", () => {
  it("finds 'remember that', 'ingat bahwa', decisions and constraints in the user's own words", () => {
    const out = explicitCandidates([
      msg("1", "user", "Ingat bahwa klien hanya memakai Midtrans untuk pembayaran."),
      msg("2", "user", "Decision: we deploy to Vercel only."),
      msg("3", "user", "constraint - no third party analytics"),
      msg("4", "user", "how do I log in?"),
      msg("5", "assistant", "Remember that I suggested Stripe."),
    ]);
    expect(out.map((c) => [c.kind, c.sourceMessageIds[0]])).toEqual([
      ["fact", "1"],
      ["decision", "2"],
      ["constraint", "3"],
    ]);
    expect(out.every((c) => c.basis === "explicit")).toBe(true);
  });
});

describe("grounding", () => {
  const window = [
    msg("m1", "user", "We must keep all invoices in rupiah and never convert currency."),
    msg("m2", "assistant", "Noted, I will keep invoices in rupiah."),
  ];
  const cand = (over: Partial<Candidate>): Candidate => ({
    kind: "constraint",
    title: "Invoices in rupiah",
    content: "Keep all invoices in rupiah, never convert currency.",
    basis: "explicit",
    sourceMessageIds: ["m1"],
    ...over,
  });

  it("keeps a claim that its cited message supports", () => {
    expect(groundCandidates([cand({})], window)).toHaveLength(1);
  });
  it("drops a claim that cites a message outside the window", () => {
    expect(groundCandidates([cand({ sourceMessageIds: ["zzz"] })], window)).toHaveLength(0);
  });
  it("drops a claim the cited text does not support", () => {
    expect(
      groundCandidates(
        [cand({ content: "Launch the mobile app on the App Store in December." })],
        window,
      ),
    ).toHaveLength(0);
  });
  it("does not let the model attribute an explicit claim to the assistant's words", () => {
    expect(groundCandidates([cand({ sourceMessageIds: ["m2"] })], window)).toHaveLength(0);
    expect(
      groundCandidates([cand({ sourceMessageIds: ["m2"], basis: "inferred" })], window),
    ).toHaveLength(1);
  });
  it("measures support and overlap between 0 and 1", () => {
    expect(support("invoices rupiah", ["all invoices in rupiah"])).toBe(1);
    expect(jaccard("use postgres database", "use postgres database")).toBe(1);
    expect(jaccard("alpha beta", "gamma delta")).toBe(0);
  });
});
