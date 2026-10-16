import { describe, expect, it } from "vitest";
import { type ChangeRow, planJournal } from "@/lib/brain/journal-plan";

const row = (revision: number, type: string, over: Partial<ChangeRow> = {}): ChangeRow => ({
  revision,
  type,
  entityType: type.split(".")[0],
  entityId: null,
  detail: null,
  ...over,
});

describe("planJournal", () => {
  it("ignores routine changes: tasks, requirements, milestones, scope, memory itself", () => {
    const rows = [
      row(1, "task.created", { entityId: "t1" }),
      row(2, "task.completed", { entityId: "t1" }),
      row(3, "requirement.updated", { entityId: "r1" }),
      row(4, "milestone.updated"),
      row(5, "scope.created"),
      row(6, "memory.created", { entityId: "m1" }),
    ];
    expect(planJournal(rows)).toEqual([]);
  });

  it("keeps one intent per fact, using the latest change", () => {
    const rows = [
      row(1, "document.updated", { entityId: "d1", detail: { slug: "prd", version: 2 } }),
      row(2, "document.updated", { entityId: "d1", detail: { slug: "prd", version: 3 } }),
      row(3, "decision.created", { entityId: "x1" }),
      row(4, "decision.updated", { entityId: "x1" }),
    ];
    const plan = planJournal(rows);
    expect(plan.map((p) => p.dedupeKey)).toEqual(["doc:prd", "decision:x1"]);
    expect(plan[0].detail).toMatchObject({ version: 3 });
  });

  it("only journals the PRD and plan documents, and needs a slug", () => {
    const plan = planJournal([
      row(1, "document.updated", { entityId: "a", detail: { slug: "notes-from-meeting" } }),
      row(2, "document.updated", { entityId: "b", detail: null }),
      row(3, "document.created", { entityId: "c", detail: { slug: "plan" } }),
    ]);
    expect(plan.map((p) => p.dedupeKey)).toEqual(["doc:plan"]);
  });

  it("skips a batch decision change that names no decision, and unusable stack/repository rows", () => {
    expect(
      planJournal([
        row(1, "decision.created", { detail: { count: 3 } }),
        row(2, "stack.updated", { detail: { value: "x" } }),
        row(3, "repository.disconnected"),
      ]),
    ).toEqual([]);
  });

  it("orders by revision whatever order the rows arrive in", () => {
    const plan = planJournal([
      row(5, "stack.updated", { detail: { title: "database", value: "mysql" } }),
      row(2, "stack.updated", { detail: { title: "database", value: "postgres" } }),
    ]);
    expect(plan).toHaveLength(1);
    expect(plan[0].detail).toMatchObject({ value: "mysql" });
  });
});
