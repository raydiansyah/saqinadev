import { eq } from "drizzle-orm";
import type { AiProvider, AiRequest } from "@/lib/ai/provider";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { executions, tasks } from "@/lib/db/schema";
import { startExecution } from "@/lib/executions/service";
import type { TaskExecutor, TaskInput, TaskResult } from "@/lib/executions/task-executor";
import { getExecutionView } from "@/lib/executions/view";
import { drainExecutions } from "@/lib/executions/worker";

/** A plan with three tasks: backend, then frontend, then QA that needs both. */
export const PLAN = {
  goal: "Add a checkout",
  risks: ["Payment provider is not chosen"],
  tasks: [
    {
      key: "api",
      title: "Checkout API",
      description: "Endpoint that creates an order.",
      role: "backend",
      dependsOn: [] as string[],
      acceptanceCriteria: ["POST /checkout validates its input"],
      targetPaths: ["src/api/checkout.ts"],
      priority: "high",
    },
    {
      key: "ui",
      title: "Checkout page",
      description: "Page that calls the endpoint.",
      role: "frontend",
      dependsOn: ["api"],
      acceptanceCriteria: ["The page shows an error when the call fails"],
      targetPaths: ["src/app/checkout"],
      priority: "medium",
    },
    {
      key: "qa",
      title: "Verify checkout",
      description: "Check the acceptance criteria.",
      role: "qa",
      dependsOn: ["api", "ui"],
      acceptanceCriteria: ["Every criterion has a verdict"],
      targetPaths: ["tests/checkout.test.ts"],
      priority: "medium",
    },
  ],
};

/** A model stand-in for the planner: returns the given plans in turn (the last one repeats). */
export function fakePlanner(...plans: unknown[]) {
  const seen: AiRequest[] = [];
  let i = 0;
  const provider = {
    deterministic: false,
    config: { provider: "mock" as const, model: "fake-planner" },
    generate: async () => "",
    stream: async function* () {},
    generateObject: async (r: AiRequest, schema: { parse: (v: unknown) => unknown }) => {
      seen.push(r);
      return schema.parse(plans[Math.min(i++, plans.length - 1)]);
    },
  };
  return { provider: provider as unknown as AiProvider, seen, calls: () => i };
}

type Step = (input: TaskInput) => TaskResult | Promise<TaskResult>;

const commit = (input: TaskInput): TaskResult => ({
  outcome: "succeeded",
  summary: `${input.task.title} done`,
  artifacts: [
    {
      kind: "commit",
      commitSha: `sha-${input.task.id.slice(0, 6)}-${input.attempt}`,
      summary: `Commit for ${input.task.title}`,
    },
  ],
});

/** Task executor driven by role. Records every call so a test can read what an agent was given. */
export function scripted(steps: Partial<Record<string, Step>> = {}) {
  const calls: TaskInput[] = [];
  const executor: TaskExecutor = async (input) => {
    calls.push(input);
    return (steps[input.definition.role] ?? commit)(input);
  };
  return { executor, calls };
}

/** A promise a test can settle later, to hold a task running while it looks around. */
export function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

export async function waitFor<T>(
  read: () => Promise<T | null | false | undefined>,
  ms = 8000,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > end) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
}

export const taskStatus = async (title: string, executionId: string) =>
  (await db.select().from(tasks).where(eq(tasks.executionId, executionId))).find(
    (t) => t.title === title,
  )?.executionStatus;

export const executionStatus = async (id: string) =>
  (await db.select().from(executions).where(eq(executions.id, id)))[0]?.status;

/** Starts an execution and runs the worker until nothing is due. */
export async function runToEnd(
  actor: Actor,
  slug: string,
  input: { mode: "plan" | "build"; request: string },
  engine: { provider: AiProvider; taskExecutor: TaskExecutor },
  now?: () => Date,
) {
  const execution = await startExecution(actor, slug, input);
  await drainExecutions({ ...engine, now });
  return { id: execution.id, view: await getExecutionView(actor, slug, execution.id) };
}

/**
 * A model stand-in for the whole team: answers by the name of the structured call
 * (`execution_plan`, `task_work`, `task_review`, `task_report`). A value or a function of the request.
 */
export function fakeTeam(answers: Record<string, unknown | ((r: AiRequest) => unknown)>) {
  const seen: Array<{ name: string; request: AiRequest }> = [];
  const provider = {
    deterministic: false,
    config: { provider: "mock" as const, model: "fake-team" },
    generate: async () => "",
    stream: async function* () {},
    generateObject: async (
      request: AiRequest,
      schema: { parse: (v: unknown) => unknown },
      name: string,
    ) => {
      seen.push({ name, request });
      const raw = answers[name];
      return schema.parse(
        typeof raw === "function" ? (raw as (r: AiRequest) => unknown)(request) : raw,
      );
    },
  };
  return { provider: provider as unknown as AiProvider, seen };
}

/** The title line of the task an agent was asked to do, from its prompt. */
export const taskTitleOf = (request: AiRequest) =>
  request.segments.find((s) => s.label === "task")?.content.split("\n")[0] ?? "";
