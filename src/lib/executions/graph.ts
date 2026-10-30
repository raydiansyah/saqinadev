import type { ExecutionTaskStatus } from "@/lib/domain/executions";

/** The shape of a task for graph rules. Pure: no database, so the rules are cheap to test. */
export interface GraphNode {
  key: string;
  dependsOn: readonly string[];
  /** Paths the task says it will write. Used to keep two tasks off the same file. */
  paths?: readonly string[];
}

export type GraphProblem =
  | { code: "duplicate_key"; key: string }
  | { code: "self_dependency"; key: string }
  | { code: "unknown_dependency"; key: string; dependsOn: string }
  | { code: "cycle"; path: string[] }
  | { code: "too_many_tasks"; max: number }
  | { code: "too_deep"; max: number; depth: number };

/** Every reason this graph cannot run. Empty means it is a valid DAG within the limits. */
export function validateGraph(
  nodes: readonly GraphNode[],
  limits: { maxTasks: number; maxDepth: number },
): GraphProblem[] {
  const problems: GraphProblem[] = [];
  if (nodes.length > limits.maxTasks)
    problems.push({ code: "too_many_tasks", max: limits.maxTasks });
  const keys = new Set<string>();
  for (const n of nodes) {
    if (keys.has(n.key)) problems.push({ code: "duplicate_key", key: n.key });
    keys.add(n.key);
  }
  for (const n of nodes)
    for (const d of n.dependsOn) {
      if (d === n.key) problems.push({ code: "self_dependency", key: n.key });
      else if (!keys.has(d))
        problems.push({ code: "unknown_dependency", key: n.key, dependsOn: d });
    }
  if (problems.length > 0) return problems;
  const cycle = findCycle(nodes);
  if (cycle) return [{ code: "cycle", path: cycle }];
  const depth = Math.max(0, ...levels(nodes).map((_, i) => i + 1));
  if (depth > limits.maxDepth) problems.push({ code: "too_deep", max: limits.maxDepth, depth });
  return problems;
}

/** The first cycle found, as a path that ends where it starts; null when there is none. */
export function findCycle(nodes: readonly GraphNode[]): string[] | null {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const state = new Map<string, 1 | 2>(); // 1 = on the current path, 2 = done
  const stack: string[] = [];
  const visit = (key: string): string[] | null => {
    state.set(key, 1);
    stack.push(key);
    for (const next of byKey.get(key)?.dependsOn ?? []) {
      if (state.get(next) === 1) return [...stack.slice(stack.indexOf(next)), next];
      if (!state.has(next)) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(key, 2);
    return null;
  };
  for (const n of nodes)
    if (!state.has(n.key)) {
      const found = visit(n.key);
      if (found) return found;
    }
  return null;
}

/**
 * Tasks grouped by how far they sit from the start: level 0 has no dependencies, level 1
 * depends only on level 0, and so on. The Plan tab draws these rows. The graph must be acyclic.
 */
export function levels(nodes: readonly GraphNode[]): string[][] {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const depth = new Map<string, number>();
  const depthOf = (key: string): number => {
    const known = depth.get(key);
    if (known !== undefined) return known;
    const deps = byKey.get(key)?.dependsOn ?? [];
    const d = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(depthOf));
    depth.set(key, d);
    return d;
  };
  const out: string[][] = [];
  for (const n of nodes) (out[depthOf(n.key)] ??= []).push(n.key);
  return out.map((row) => row ?? []);
}

export interface RunnableTask extends GraphNode {
  status: ExecutionTaskStatus;
}

/** Waiting tasks whose every dependency has really succeeded. */
export function readyTasks(tasks: readonly RunnableTask[]): RunnableTask[] {
  const status = new Map(tasks.map((t) => [t.key, t.status]));
  return tasks.filter(
    (t) =>
      (t.status === "pending" || t.status === "queued") &&
      t.dependsOn.every((d) => status.get(d) === "succeeded"),
  );
}

/** Waiting tasks that can never run because a task they need failed or was cancelled. */
export function unreachableTasks(tasks: readonly RunnableTask[]): RunnableTask[] {
  const dead = new Set(
    tasks.filter((t) => t.status === "failed" || t.status === "cancelled").map((t) => t.key),
  );
  const out: RunnableTask[] = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tasks) {
      if (dead.has(t.key) || (t.status !== "pending" && t.status !== "queued")) continue;
      if (t.dependsOn.some((d) => dead.has(d))) {
        dead.add(t.key);
        out.push(t);
        grew = true;
      }
    }
  }
  return out;
}

/** The task and everything that depends on it, directly or not. Cancelling one cancels these. */
export function withDependents(tasks: readonly GraphNode[], key: string): string[] {
  const hit = new Set([key]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tasks)
      if (!hit.has(t.key) && t.dependsOn.some((d) => hit.has(d))) {
        hit.add(t.key);
        grew = true;
      }
  }
  return [...hit];
}

const overlaps = (a: string, b: string) => {
  const x = a.replace(/\/+$/, "");
  const y = b.replace(/\/+$/, "");
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
};

/** True when any path of one task is the same file or folder as a path of the other. */
export const pathsConflict = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.some((p) => b.some((q) => overlaps(p, q)));

/**
 * From the ready tasks, the ones to start now: at most `slots`, and never two that write the
 * same path, nor one that clashes with a task already running. A task held back by a clash
 * is not lost; it is ready again when the other one finishes.
 */
export function pickRunnable(
  ready: readonly RunnableTask[],
  running: readonly GraphNode[],
  slots: number,
): { start: RunnableTask[]; held: Array<{ task: RunnableTask; behind: string }> } {
  const start: RunnableTask[] = [];
  const held: Array<{ task: RunnableTask; behind: string }> = [];
  const busy: GraphNode[] = [...running];
  for (const task of ready) {
    const clash = busy.find((b) => pathsConflict(task.paths, b.paths));
    if (clash) held.push({ task, behind: clash.key });
    else if (start.length < slots) {
      start.push(task);
      busy.push(task);
    }
  }
  return { start, held };
}
