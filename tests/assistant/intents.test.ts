import { describe, expect, it } from "vitest";
import { classifyWithRules } from "@/lib/assistant/intents/rules";
import { intentClassification } from "@/lib/assistant/intents/types";

describe("intent rules", () => {
  it.each([
    ["Tambahkan role manager.", "CREATE_REQUIREMENT", { role: "manager" }],
    ["Apakah PRD kita sudah konsisten?", "ANALYZE_PRD", {}],
    ["Buatkan task untuk authentication.", "CREATE_TASK", { title: "Authentication" }],
    ["Perbaiki requirement payment.", "UPDATE_REQUIREMENT", { topic: "payment" }],
    ["Kenapa kamu memilih PostgreSQL?", "ASK_DECISION", { topic: "PostgreSQL" }],
    ["Analisa task yang sedang blocked.", "ANALYZE_TASKS", { target: "blocked" }],
    ["Siapkan rencana implementasi login.", "GENERATE_PLAN", { feature: "Login" }],
    ["Jadikan task ini prioritas tinggi.", "UPDATE_TASK", { priority: "high", target: "current" }],
    ["Pecah task ini menjadi beberapa subtask.", "SPLIT_TASK", { target: "current" }],
    ["Hapus semua task yang belum dimulai.", "DELETE_TASKS", { target: "all_not_started" }],
    ["Tambahkan authentication Google", "ADD_FEATURE", { feature: "Authentication Google" }],
    ["Buat sistem refund.", "ADD_FEATURE", { feature: "Refund" }],
    [
      "Create a task to set up CI with high priority",
      "CREATE_TASK",
      { title: "Set up CI", priority: "high" },
    ],
    ["Why did we choose Next.js?", "ASK_DECISION", { topic: "Next.js" }],
    ["Assign this task to an agent", "ASSIGN_AGENT", { target: "current" }],
  ])("%s → %s", (message, intent, entities) => {
    const result = classifyWithRules(message);
    expect(result.intent).toBe(intent);
    expect(result.entities).toMatchObject(entities);
  });

  it("falls back to a question or help instead of guessing an action", () => {
    expect(classifyWithRules("Bagaimana progress proyek ini?").intent).toBe("ASK_PROJECT");
    expect(classifyWithRules("halo").intent).toBe("HELP");
  });

  it("uses the current task for vague task questions", () => {
    const entity = { type: "task", id: "x", title: "Login" };
    expect(classifyWithRules("ok", { entity }).intent).toBe("ASK_TASK");
  });

  it("rejects malformed model output", () => {
    expect(
      intentClassification.safeParse({ intent: "DROP_TABLES", confidence: 1, entities: {} })
        .success,
    ).toBe(false);
    expect(
      intentClassification.safeParse({ intent: "CREATE_TASK", confidence: 2, entities: {} })
        .success,
    ).toBe(false);
    expect(
      intentClassification.safeParse({
        intent: "CREATE_TASK",
        confidence: 0.9,
        entities: { priority: "urgent!!" },
      }).success,
    ).toBe(false);
  });
});
