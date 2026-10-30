import { describe, expect, it } from "vitest";
import {
  findCycle,
  levels,
  pathsConflict,
  pickRunnable,
  type RunnableTask,
  readyTasks,
  unreachableTasks,
  validateGraph,
  withDependents,
} from "@/lib/executions/graph";

const limits = { maxTasks: 10, maxDepth: 4 };
const node = (key: string, dependsOn: string[] = [], paths?: string[]) => ({
  key,
  dependsOn,
  paths,
});
const task = (
  key: string,
  status: RunnableTask["status"],
  dependsOn: string[] = [],
  paths?: string[],
): RunnableTask => ({ key, status, dependsOn, paths });

describe("validateGraph", () => {
  it("accepts a valid graph", () => {
    expect(validateGraph([node("a"), node("b", ["a"]), node("c", ["a", "b"])], limits)).toEqual([]);
  });

  it("rejects a cycle and names its path", () => {
    const problems = validateGraph([node("a", ["c"]), node("b", ["a"]), node("c", ["b"])], limits);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: "cycle" });
    const path = (problems[0] as { path: string[] }).path;
    expect(path[0]).toBe(path[path.length - 1]);
  });

  it("rejects a task that depends on itself, an unknown dependency and a duplicate key", () => {
    expect(validateGraph([node("a", ["a"])], limits)).toEqual([
      { code: "self_dependency", key: "a" },
    ]);
    expect(validateGraph([node("a", ["ghost"])], limits)).toEqual([
      { code: "unknown_dependency", key: "a", dependsOn: "ghost" },
    ]);
    expect(validateGraph([node("a"), node("a")], limits)).toContainEqual({
      code: "duplicate_key",
      key: "a",
    });
  });

  it("enforces the task budget and the depth of a chain", () => {
    const many = Array.from({ length: 11 }, (_, i) => node(`t${i}`));
    expect(validateGraph(many, limits)).toContainEqual({ code: "too_many_tasks", max: 10 });
    const chain = ["a", "b", "c", "d", "e"].map((k, i, all) => node(k, i ? [all[i - 1]] : []));
    expect(validateGraph(chain, limits)).toEqual([{ code: "too_deep", max: 4, depth: 5 }]);
  });
});

describe("findCycle and levels", () => {
  it("finds no cycle in a diamond", () => {
    expect(
      findCycle([node("a"), node("b", ["a"]), node("c", ["a"]), node("d", ["b", "c"])]),
    ).toBeNull();
  });

  it("groups tasks by distance from the start", () => {
    expect(levels([node("a"), node("b", ["a"]), node("c", ["a"]), node("d", ["b", "c"])])).toEqual([
      ["a"],
      ["b", "c"],
      ["d"],
    ]);
  });
});

describe("readyTasks", () => {
  it("never returns a task before its dependencies have succeeded", () => {
    const tasks = [
      task("api", "running"),
      task("ui", "pending", ["api"]),
      task("qa", "pending", ["api", "ui"]),
    ];
    expect(readyTasks(tasks)).toEqual([]);
  });

  it("returns a task when all its dependencies succeeded", () => {
    const tasks = [
      task("api", "succeeded"),
      task("ui", "pending", ["api"]),
      task("qa", "pending", ["ui"]),
    ];
    expect(readyTasks(tasks).map((t) => t.key)).toEqual(["ui"]);
  });

  it("does not treat a failed or reviewing dependency as met", () => {
    expect(readyTasks([task("a", "failed"), task("b", "pending", ["a"])])).toEqual([]);
    expect(readyTasks([task("a", "reviewing"), task("b", "pending", ["a"])])).toEqual([]);
  });
});

describe("unreachableTasks and withDependents", () => {
  it("finds every waiting task behind a failed one", () => {
    const tasks = [
      task("a", "failed"),
      task("b", "pending", ["a"]),
      task("c", "pending", ["b"]),
      task("d", "pending"),
    ];
    expect(unreachableTasks(tasks).map((t) => t.key)).toEqual(["b", "c"]);
  });

  it("treats a blocked task like a failed one for what waits behind it", () => {
    const tasks = [task("a", "blocked"), task("b", "pending", ["a"]), task("c", "pending")];
    expect(unreachableTasks(tasks).map((t) => t.key)).toEqual(["b"]);
  });

  it("lists a task with everything that depends on it", () => {
    const tasks = [node("a"), node("b", ["a"]), node("c", ["b"]), node("d")];
    expect(withDependents(tasks, "a").sort()).toEqual(["a", "b", "c"]);
  });
});

describe("path conflicts", () => {
  it("treats the same file and a parent folder as a clash", () => {
    expect(pathsConflict(["src/a.ts"], ["src/a.ts"])).toBe(true);
    expect(pathsConflict(["src"], ["src/a.ts"])).toBe(true);
    expect(pathsConflict(["src/a.ts"], ["src/ab.ts"])).toBe(false);
    expect(pathsConflict(undefined, ["src"])).toBe(false);
  });

  it("holds back a task that would write a file another one is writing", () => {
    const ready = [
      task("a", "queued", [], ["src/x.ts"]),
      task("b", "queued", [], ["src/x.ts"]),
      task("c", "queued"),
    ];
    const { start, held } = pickRunnable(ready, [], 3);
    expect(start.map((t) => t.key)).toEqual(["a", "c"]);
    expect(held).toEqual([{ task: ready[1], behind: "a" }]);
  });

  it("holds back a task that clashes with one already running, and respects the slots", () => {
    const ready = [task("a", "queued", [], ["src"]), task("b", "queued"), task("c", "queued")];
    const { start } = pickRunnable(ready, [node("run", [], ["src/y.ts"])], 1);
    expect(start.map((t) => t.key)).toEqual(["b"]);
  });
});
