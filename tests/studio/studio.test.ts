import { describe, expect, it } from "vitest";
import { focusFor } from "@/lib/assistant/focus";
import { mergePending } from "@/lib/assistant/service";
import { acceptRefined } from "@/lib/interviews/ai-intelligence";
import { canStartBuilding } from "@/lib/studio/ready";

describe("when Start building is offered", () => {
  it("an approved PRD or plan", () => {
    expect(
      canStartBuilding({ slug: "prd", type: "prd", status: "approved", reference: null }),
    ).toBe(true);
    expect(
      canStartBuilding({ slug: "plan", type: "plan", status: "approved", reference: null }),
    ).toBe(true);
    expect(canStartBuilding({ slug: "prd", type: "prd", status: "review", reference: null })).toBe(
      false,
    );
  });

  it("a signable document only once signed by both and issued", () => {
    const doc = { slug: "agreement", type: "agreement" };
    expect(canStartBuilding({ ...doc, status: "approved", reference: null })).toBe(false);
    expect(canStartBuilding({ ...doc, status: "signed", reference: null })).toBe(false);
    expect(canStartBuilding({ ...doc, status: "signed", reference: "AGR-2026-001" })).toBe(true);
    expect(
      canStartBuilding({ slug: "notes", type: "custom", status: "approved", reference: null }),
    ).toBe(false);
  });
});

describe("where the work area turns", () => {
  const answer = { kind: "answer" as const, draft: "", blocks: [] };
  it("plans and tasks go to Plan, agent work to Agents, questions nowhere", () => {
    expect(focusFor("GENERATE_PLAN", answer)).toBe("plan");
    expect(focusFor("ASSIGN_AGENT", answer)).toBe("agents");
    expect(focusFor("ASK_BILLING", answer)).toBeNull();
    expect(
      focusFor("GENERATE_PLAN", {
        kind: "clarify",
        draft: "?",
        options: [],
        pending: { intent: "GENERATE_PLAN", entities: {}, question: "feature" },
      }),
    ).toBeNull();
  });
});

describe("an unsure request is confirmed first", () => {
  const pending = {
    intent: "DELETE_TASKS" as const,
    entities: { target: "blocked" as const },
    question: "confirm_intent",
  };
  it("yes carries out the request as understood", () => {
    expect(
      mergePending({ intent: "HELP", confidence: 0.3, entities: {} }, pending, "Ya, lanjutkan"),
    ).toEqual({ intent: "DELETE_TASKS", confidence: 1, entities: { target: "blocked" } });
  });
  it("anything else never runs it", () => {
    expect(
      mergePending(
        { intent: "HELP", confidence: 0.3, entities: {} },
        pending,
        "No, I meant something else",
      ).intent,
    ).toBe("HELP");
    expect(
      mergePending({ intent: "DELETE_TASKS", confidence: 0.4, entities: {} }, pending, "hmm")
        .intent,
    ).toBe("HELP");
  });
});

describe("a refined document from a model", () => {
  it("is accepted only when it is still the whole document", () => {
    expect(acceptRefined("# PRD\n\n## A\n\n## B\n", 2)).toBe("# PRD\n\n## A\n\n## B\n");
    expect(acceptRefined("```markdown\n# PRD\n## A\n## B\n```", 2)).toContain("# PRD");
    expect(acceptRefined("Sure! Here it is", 1)).toBeNull();
    expect(acceptRefined("# PRD\n\n## A\n", 2)).toBeNull();
  });
});
