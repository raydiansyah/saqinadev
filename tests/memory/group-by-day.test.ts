import { describe, expect, it } from "vitest";
import { groupMemoriesByDay } from "@/components/memory/group-by-day";
import type { MemoryView } from "@/lib/memory/service";

const memory = (id: string, created: string, updated = created): MemoryView =>
  ({
    id,
    title: id,
    content: "c",
    category: "product",
    importance: "normal",
    source: "user",
    createdAt: new Date(created),
    updatedAt: new Date(updated),
  }) as unknown as MemoryView;

const labels = { today: "Today", yesterday: "Yesterday" };
const now = new Date("2026-10-15T10:00:00Z");

describe("groupMemoriesByDay", () => {
  it("keeps the full timestamps of each memory, not just a clock time", () => {
    const [group] = groupMemoriesByDay(
      [memory("a", "2026-10-15T07:20:00Z", "2026-10-15T09:00:00Z")],
      "en",
      labels,
      now,
    );
    expect(group.label).toBe("Today");
    expect(group.items[0]).toMatchObject({
      createdAt: "2026-10-15T07:20:00.000Z",
      updatedAt: "2026-10-15T09:00:00.000Z",
    });
  });

  it("groups by day, newest first, with readable labels for older days", () => {
    const groups = groupMemoriesByDay(
      [
        memory("a", "2026-10-15T07:00:00Z"),
        memory("b", "2026-10-14T20:00:00Z"),
        memory("c", "2026-10-01T08:00:00Z"),
      ],
      "en",
      labels,
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "October 1, 2026"]);
  });
});
