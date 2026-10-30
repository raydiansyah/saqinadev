import * as z from "zod";
import { PRIORITIES } from "@/lib/domain/enums";

const KEY = /^[a-z][a-z0-9_-]{0,30}$/;

export const planTask = z.object({
  key: z.string().regex(KEY),
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(1500).default(""),
  /** One of the roles the planner was given. */
  role: z.string().trim().min(2).max(30),
  dependsOn: z.array(z.string().regex(KEY)).max(8).default([]),
  acceptanceCriteria: z.array(z.string().trim().min(3).max(300)).min(1).max(8),
  /** Files or folders the task writes. Two tasks on the same path run one after the other. */
  targetPaths: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  priority: z.enum(PRIORITIES).default("medium"),
});

export const executionPlan = z.object({
  goal: z.string().trim().min(3).max(600),
  risks: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  tasks: z.array(planTask).min(1).max(40),
});

export type ExecutionPlan = z.output<typeof executionPlan>;
export type PlanTask = z.output<typeof planTask>;

/** A path inside the repository: relative, no `..`. Anything else is dropped, not trusted. */
export const cleanPaths = (paths: readonly string[]): string[] =>
  [
    ...new Set(
      paths
        .map((p) => p.replace(/^\.?\/+/, "").replace(/\/+$/, ""))
        .filter((p) => p.length > 0 && !p.split("/").some((s) => s === ".." || s === ".")),
    ),
  ].slice(0, 12);
