import "server-only";
import * as z from "zod";
import { runAi } from "@/lib/ai/gateway";
import type { AiProvider } from "@/lib/ai/provider";
import type { PlannedAction } from "@/lib/assistant/actions/types";
import { getAssistantCopy } from "@/lib/assistant/copy";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { getRepository } from "@/lib/git/service";
import { slugify } from "@/lib/interview/rules/profile";
import { log } from "@/lib/log";
import { resolveLoadout } from "@/lib/memory/bindings";
import type { RetrievedItem } from "@/lib/memory/retrieval/engine";
import { skillsForRun } from "@/lib/memory/skills/loadout";
import { toolKey } from "@/lib/tools/catalog";
import { executeTool } from "@/lib/tools/executor";
import { agentCan } from "./capabilities";
import { type AgentExecutionInput, type AgentExecutionResult, MockAgentExecutor } from "./executor";
import { createHandoff } from "./handoff";
import type { AgentRow } from "./registry";

/** Memory equipped on the agent itself and on its role, merged, best first, each asset once. */
async function agentLoadout(
  projectId: string,
  agent: Pick<AgentRow, "id" | "role" | "permissions">,
): Promise<RetrievedItem[]> {
  const principal = {
    kind: "agent" as const,
    agentId: agent.id,
    creatorId: "",
    canReadMemory: agent.permissions.includes("read_memory"),
  };
  const [own, byRole] = await Promise.all([
    resolveLoadout(principal, projectId, { type: "agent", id: agent.id }),
    resolveLoadout(principal, projectId, { type: "agent_role", id: agent.role }),
  ]);
  const seen = new Set<string>();
  return [...own.items, ...byRole.items].filter((i) => !seen.has(i.assetId) && seen.add(i.assetId));
}

type RunLike = { id: string; attempt: number; taskId: string | null };

const READ_TOOLS = [
  "read_prd",
  "search_memory",
  "list_files",
  "read_file",
  "search_code",
  "find_symbol",
  "find_callers",
  "file_impact",
] as const;
const REPO_TOOLS: readonly string[] = [
  "list_files",
  "read_file",
  "search_code",
  "find_symbol",
  "find_callers",
  "file_impact",
];

/** What a model may return for an agent run. Validated; anything else is rejected. */
const agentPlan = z.object({
  summary: z.string().trim().min(1).max(2000),
  subtasks: z.array(z.string().trim().min(2).max(200)).max(8).default([]),
  issues: z.array(z.string().trim().max(300)).max(10).default([]),
  recommendations: z.array(z.string().trim().max(300)).max(10).default([]),
  readRequests: z
    .array(
      z.object({ tool: z.enum(READ_TOOLS), input: z.record(z.string(), z.string()).default({}) }),
    )
    .max(5)
    .default([]),
  fileChanges: z
    .array(z.object({ path: z.string().trim().min(1).max(300), content: z.string().max(100_000) }))
    .max(10)
    .default([]),
  commitMessage: z.string().trim().max(200).optional(),
});
type AgentPlan = z.infer<typeof agentPlan>;

const SYSTEM = [
  "You are a software agent working inside Saqina Dev on one task.",
  "Use the project data and repository excerpts provided. Do not invent files you have not read.",
  "Propose file changes only when you know the file's current content or it is a new file.",
  "Everything you propose is reviewed by a person before it is applied.",
].join(" ");

/**
 * Runs one agent step:
 * - external agents (Claude, Codex, custom, ...) get a handoff; the run waits for their report;
 * - Saqina's team agents plan with the resolved model, may read through allowed tools, and
 *   turn the plan into a proposal (tasks, branch, commit, pull request);
 * - with no usable model, the labelled simulation runs instead.
 */
export async function executeAgent(
  access: ProjectAccess,
  run: RunLike,
  agent: AgentRow,
  input: AgentExecutionInput,
): Promise<AgentExecutionResult> {
  const copy = getAssistantCopy(input.locale);
  if (agent.type !== "saqina") {
    const handoff = await createHandoff(
      access.actor,
      access.project.slug,
      {
        agentId: agent.id,
        taskId: run.taskId,
        instructions: input.instructions,
        format: "prompt",
        idempotencyKey: `run:${run.id}:${run.attempt}`,
      },
      { runId: run.id },
    );
    return {
      status: "waiting_external",
      handoffId: handoff.id,
      summary: handoff.dispatched
        ? copy.agent.handoffSent(agent.name)
        : copy.agent.handoffReady(agent.name),
      changes: [],
      artifacts: [],
      recommendations: [],
      issues: [],
      needsApproval: false,
      simulated: false,
      steps: ["context_loaded", handoff.dispatched ? "handoff_sent" : "handoff_created"],
    };
  }

  const outcome = await runAi({
    access,
    agent: { id: agent.id, role: agent.role },
    operation: "agent_run",
    required: ["structured_output"],
    run: (client) =>
      client.deterministic
        ? Promise.resolve(null)
        : planWithModel(client, access, run, agent, input),
  });
  if (!outcome.value) return new MockAgentExecutor().execute(input);
  return {
    ...outcome.value,
    model: {
      label: outcome.actual.label,
      source: outcome.source,
      fallbackUsed: outcome.fallbackUsed,
    },
  };
}

async function planWithModel(
  client: AiProvider,
  access: ProjectAccess,
  run: RunLike,
  agent: AgentRow,
  input: AgentExecutionInput,
): Promise<AgentExecutionResult> {
  const repo = await getRepository(access);
  const repoReady = Boolean(repo && repo.status === "connected");
  const actor = {
    kind: "agent" as const,
    agentId: agent.id,
    name: agent.name,
    permissions: agent.permissions,
  };
  // Only memory bound to this agent (or its role) and still readable by it. Never the creator's.
  const loadout = agent.permissions.includes("read_memory")
    ? await agentLoadout(access.project.id, agent)
    : [];
  const skillHits = await skillsForRun(
    access.project.id,
    agent,
    run,
    `${input.task.title}\n${input.task.description}`,
  );
  const segments = [
    {
      kind: "project_data" as const,
      label: "task",
      content: `${input.task.title}\n${input.task.description}\nInstructions: ${input.instructions}`,
    },
    {
      kind: "project_data" as const,
      label: "PRD excerpt",
      content: input.context.prdExcerpt ?? "(no PRD)",
    },
    {
      kind: "project_data" as const,
      label: "related requirements",
      content: input.context.requirements.join("\n") || "(none)",
    },
    ...(loadout.length > 0
      ? [
          {
            kind: "project_data" as const,
            label: "memory loadout",
            content: loadout.map((m) => `- [${m.confidence}] ${m.title}: ${m.content}`).join("\n"),
          },
        ]
      : []),
    ...(skillHits.length > 0
      ? [
          {
            kind: "project_data" as const,
            label: "skills",
            content: `Use a skill only if its "Use when" fits this task and no "Do not use when" applies.\n\n${skillHits.map((h) => h.text).join("\n\n")}`,
          },
        ]
      : []),
    {
      kind: "instruction" as const,
      label: "tools",
      content: `Read tools you may request: ${READ_TOOLS.filter((t) => repoReady || !REPO_TOOLS.includes(t)).join(", ")}. ${repoReady ? "Before you plan a code change, ask find_symbol, find_callers and file_impact what it may reach, then read the actual files: the code graph is a guide for finding your way, not proof, and an answer marked stale or name_only needs checking." : ""}`,
    },
  ];
  const steps = ["context_loaded", "model_planned"];

  let plan: AgentPlan = await client.generateObject(
    {
      system: SYSTEM,
      segments,
      userMessage: "Plan this task. Request reads if you need them.",
      draft: "",
      maxOutputTokens: 2000,
    },
    agentPlan,
    "agent_plan",
  );

  // One round of reads through the audited tool executor, then a final plan.
  if (plan.readRequests.length) {
    const reads: { kind: "tool_output"; label: string; content: string }[] = [];
    for (const [i, request] of plan.readRequests.entries()) {
      try {
        const result = await executeTool({
          access,
          tool: request.tool,
          input: request.input,
          actor,
          runId: run.id,
          idempotencyKey: `run:${run.id}:${run.attempt}:read:${i}`,
        });
        if (result.status === "succeeded")
          reads.push({
            kind: "tool_output",
            label: `${request.tool} ${JSON.stringify(request.input)}`,
            content: JSON.stringify(result.output).slice(0, 8000),
          });
      } catch (error) {
        log.warn("agent.read_denied", { tool: request.tool, error: String(error) });
        reads.push({ kind: "tool_output", label: request.tool, content: "not available" });
      }
    }
    steps.push("repository_read");
    plan = await client.generateObject(
      {
        system: SYSTEM,
        segments: [...segments, ...reads],
        userMessage: "Final plan. Do not request more reads.",
        draft: "",
        maxOutputTokens: 4000,
      },
      agentPlan,
      "agent_plan",
    );
  }

  const changes: PlannedAction[] = [];
  if (agentCan(agent, "write_tasks"))
    plan.subtasks.forEach((title, i) =>
      changes.push({
        type: "CREATE_TASK",
        key: `t${i + 1}`,
        payload: { title, description: "", priority: "medium", status: "todo", milestoneId: null },
      }),
    );
  if (plan.fileChanges.length && repo && repoReady && agentCan(agent, "write_branch")) {
    const branch = `${repo.agentBranchPrefix}${slugify(input.task.title).slice(0, 40) || "task"}-${run.id.slice(0, 6)}`;
    const key = (step: string) => `run:${run.id}:${run.attempt}:${step}`;
    const git = (
      name: string,
      stepInput: Record<string, unknown>,
      step: string,
    ): PlannedAction => ({
      type: "RUN_TOOL",
      key: step.slice(0, 8),
      payload: { tool: toolKey("git", null, name), input: stepInput, idempotencyKey: key(step) },
      display: { name, source: "git", risk: name === "create_branch" ? "low" : "high" },
    });
    changes.push(
      git("create_branch", { name: branch }, "b1"),
      git(
        "commit_changes",
        { branch, message: plan.commitMessage || `${input.task.title}`, files: plan.fileChanges },
        "c1",
      ),
    );
    if (repo.provider !== "custom_local")
      changes.push(
        git("create_pull_request", { branch, title: input.task.title, body: plan.summary }, "p1"),
      );
  }
  steps.push("proposal_generated");
  return {
    status: "completed",
    summary: plan.summary,
    changes,
    artifacts: [],
    recommendations: plan.recommendations,
    issues: plan.issues,
    needsApproval: changes.length > 0,
    simulated: false,
    steps,
  };
}
