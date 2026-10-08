import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { type ActivityView, listActivity } from "@/lib/activity/service";
import { type AgentRow, listAgentRegistry } from "@/lib/agents/registry";
import type { PromptSegment } from "@/lib/ai/provider";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { decisions, documents, memories, requirements, tasks } from "@/lib/db/schema";
import type { TechStack } from "@/lib/db/schema/projects";
import { type DecisionView, listDecisions } from "@/lib/decisions/service";
import type { ConversationContext } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { getRepository, type RepositoryView, toRepositoryView } from "@/lib/git/service";
import type { StackMismatch } from "@/lib/git/stack";
import { listMemories, type MemoryView } from "@/lib/memory/service";
import type { ProjectSnapshot } from "@/lib/projects/progress";
import { getSettings, loadSnapshot } from "@/lib/projects/repository";
import { getTechStack, projectStackMismatches } from "@/lib/projects/stack";
import { listRecommendations, type StoredRecommendation } from "@/lib/recommendations/service";
import { listRequirements, type RequirementView } from "@/lib/requirements/service";
import { listTasks, type TaskView } from "@/lib/tasks/service";
import type { Intent } from "./intents/types";

export interface EntityRef {
  type: ConversationContext;
  id: string | null;
}

/** The thing the user is looking at, loaded and verified to belong to this project. */
export type ResolvedEntity =
  | { type: "project"; id: null; title: string }
  | { type: "task"; id: string; title: string; task: TaskView }
  | { type: "requirement"; id: string; title: string; requirement: RequirementView }
  | { type: "decision"; id: string; title: string; decision: DecisionView }
  | { type: "memory"; id: string; title: string; memory: MemoryView }
  | { type: "document" | "prd"; id: string; title: string; slug: string };

type Slice =
  | "requirements"
  | "tasks"
  | "prd"
  | "decisions"
  | "memory"
  | "recommendations"
  | "activity"
  | "agents"
  | "repository";

/** Only what each intent needs. Nothing project-wide rides along by default. */
const NEEDS: Record<Intent, Slice[]> = {
  ASK_PROJECT: ["requirements", "tasks", "activity"],
  ASK_REQUIREMENT: ["requirements"],
  ASK_PRD: ["prd"],
  ASK_TASK: ["tasks", "activity"],
  ASK_DECISION: ["decisions", "recommendations", "memory"],
  ASK_MEMORY: ["memory"],
  CREATE_TASK: [],
  UPDATE_TASK: ["tasks"],
  COMPLETE_TASK: ["tasks"],
  DELETE_TASKS: ["tasks"],
  SPLIT_TASK: ["tasks"],
  CREATE_REQUIREMENT: ["requirements"],
  UPDATE_REQUIREMENT: ["requirements"],
  ADD_FEATURE: ["requirements", "agents"],
  UPDATE_PRD: ["prd"],
  CREATE_MEMORY: [],
  CREATE_DECISION: [],
  ANALYZE_PROJECT: ["requirements", "tasks", "prd"],
  ANALYZE_REQUIREMENTS: ["requirements"],
  ANALYZE_PRD: ["prd", "requirements"],
  ANALYZE_TASKS: ["tasks"],
  GENERATE_PLAN: ["tasks"],
  GENERATE_PRD: ["prd"],
  ASSIGN_AGENT: ["tasks", "agents"],
  RUN_AGENT: ["tasks", "agents"],
  REQUEST_APPROVAL: [],
  HANDOFF_AGENT: ["tasks", "agents", "repository"],
  ASK_REPOSITORY: ["repository"],
  ANALYZE_REPOSITORY: ["repository"],
  HELP: [],
};

export interface AssistantContext {
  access: ProjectAccess;
  snapshot: ProjectSnapshot;
  approvalPolicy: "auto_low_risk" | "always";
  aiModel: string | null;
  entity: ResolvedEntity;
  summary: string | null;
  requirements?: RequirementView[];
  tasks?: TaskView[];
  prd?: { content: string; version: number; status: string } | null;
  decisions?: DecisionView[];
  memories?: MemoryView[];
  recommendations?: StoredRecommendation[];
  activity?: ActivityView[];
  agents?: AgentRow[];
  agentLoad?: Record<string, number>;
  /** Repository view, stack and mismatches, loaded only for repository questions. */
  repository?: {
    view: RepositoryView | null;
    stack: TechStack;
    mismatches: StackMismatch[];
  };
}

/**
 * Loads the entity by id scoped to the project. An id from another project is reported as
 * NOT_FOUND, exactly like an id that does not exist, so nothing leaks across projects.
 */
export async function resolveEntity(
  access: ProjectAccess,
  ref: EntityRef | null,
): Promise<ResolvedEntity> {
  const projectId = access.project.id;
  const project = { type: "project" as const, id: null, title: access.project.name };
  if (!ref || ref.type === "project") return project;
  if (ref.type === "prd") return { type: "prd", id: "prd", title: "PRD", slug: "prd" };
  if (!ref.id) throw new AppError("VALIDATION_ERROR", "Missing entity id");
  const uuid = /^[0-9a-f-]{36}$/i.test(ref.id);
  switch (ref.type) {
    case "task": {
      const [task] = uuid
        ? await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.id, ref.id), eq(tasks.projectId, projectId)))
        : [];
      if (!task) throw new AppError("NOT_FOUND");
      return { type: "task", id: task.id, title: task.title, task };
    }
    case "requirement": {
      const [row] = uuid
        ? await db
            .select()
            .from(requirements)
            .where(and(eq(requirements.id, ref.id), eq(requirements.projectId, projectId)))
        : [];
      if (!row) throw new AppError("NOT_FOUND");
      return { type: "requirement", id: row.id, title: row.title, requirement: row };
    }
    case "decision": {
      const [row] = uuid
        ? await db
            .select()
            .from(decisions)
            .where(and(eq(decisions.id, ref.id), eq(decisions.projectId, projectId)))
        : [];
      if (!row) throw new AppError("NOT_FOUND");
      return { type: "decision", id: row.id, title: row.question, decision: row };
    }
    case "memory": {
      const [row] = uuid
        ? await db
            .select()
            .from(memories)
            .where(and(eq(memories.id, ref.id), eq(memories.projectId, projectId)))
        : [];
      if (!row) throw new AppError("NOT_FOUND");
      return { type: "memory", id: row.id, title: row.title, memory: row };
    }
    case "document": {
      const [row] = await db
        .select({ slug: documents.slug, title: documents.title })
        .from(documents)
        .where(and(eq(documents.slug, ref.id), eq(documents.projectId, projectId)));
      if (!row) throw new AppError("NOT_FOUND");
      return {
        type: row.slug === "prd" ? "prd" : "document",
        id: row.slug,
        title: row.title,
        slug: row.slug,
      };
    }
  }
}

export async function buildContext(
  access: ProjectAccess,
  intent: Intent,
  entity: ResolvedEntity,
  summary: string | null,
): Promise<AssistantContext> {
  const needs = new Set(NEEDS[intent]);
  // A specific entity pulls in its own neighbourhood.
  if (entity.type === "task") needs.add("tasks");
  if (entity.type === "prd") needs.add("prd");

  const [snapshot, settings] = await Promise.all([
    loadSnapshot(db, access.project),
    getSettings(db, access.project.id),
  ]);
  const ctx: AssistantContext = {
    access,
    snapshot,
    approvalPolicy: settings?.approvalPolicy ?? "auto_low_risk",
    aiModel: settings?.aiModel ?? null,
    entity,
    summary,
  };
  await Promise.all([
    needs.has("requirements") && listRequirements(access).then((r) => (ctx.requirements = r)),
    needs.has("tasks") && listTasks(access).then((r) => (ctx.tasks = r)),
    needs.has("decisions") && listDecisions(access).then((r) => (ctx.decisions = r)),
    needs.has("memory") && listMemories(access).then((r) => (ctx.memories = r.slice(0, 30))),
    needs.has("recommendations") &&
      listRecommendations(access).then((r) => (ctx.recommendations = r)),
    needs.has("activity") &&
      listActivity(access.project.id, { limit: 10 }).then((r) => (ctx.activity = r.items)),
    needs.has("repository") &&
      Promise.all([
        getRepository(access),
        getTechStack(access),
        projectStackMismatches(access),
      ]).then(([row, stack, mismatches]) => {
        ctx.repository = { view: row ? toRepositoryView(row) : null, stack, mismatches };
      }),
    needs.has("agents") &&
      listAgentRegistry(access).then((r) => {
        ctx.agents = r.agents;
        ctx.agentLoad = r.load;
      }),
    needs.has("prd") &&
      db
        .select({
          content: documents.content,
          version: documents.version,
          status: documents.status,
        })
        .from(documents)
        .where(and(eq(documents.projectId, access.project.id), eq(documents.slug, "prd")))
        .orderBy(desc(documents.version))
        .then(([row]) => (ctx.prd = row ?? null)),
  ]);
  return ctx;
}

const BUDGET = 12_000;

/**
 * Prompt segments in priority order: the current entity, then project state, then memory,
 * then history. Lower-priority segments are dropped once the character budget is spent.
 * Agent configuration and member data are never included.
 */
export function contextSegments(ctx: AssistantContext): PromptSegment[] {
  const { project } = ctx.access;
  const segments: PromptSegment[] = [
    {
      kind: "project_data",
      label: "project",
      content: `Name: ${project.name}\nStatus: ${project.status}\nSummary: ${project.description ?? ""}`,
    },
  ];
  const e = ctx.entity;
  if (e.type === "task")
    segments.push({
      kind: "project_data",
      label: "current task",
      content: `${e.task.title} [${e.task.status}, ${e.task.priority}]\n${e.task.description}`,
    });
  if (e.type === "requirement")
    segments.push({
      kind: "project_data",
      label: "current requirement",
      content: `${e.requirement.title} [${e.requirement.status}]\n${e.requirement.description}`,
    });
  if (e.type === "decision")
    segments.push({
      kind: "project_data",
      label: "current decision",
      content: `${e.decision.question}\nChosen: ${e.decision.selected}\nReason: ${e.decision.reason}`,
    });
  if (ctx.requirements)
    segments.push({
      kind: "project_data",
      label: "requirements",
      content: ctx.requirements
        .map((r) => `- [${r.status}] ${r.title}: ${r.description}`)
        .join("\n"),
    });
  if (ctx.tasks)
    segments.push({
      kind: "project_data",
      label: "tasks",
      content: ctx.tasks.map((t) => `- [${t.status}/${t.priority}] ${t.title}`).join("\n"),
    });
  if (ctx.prd) segments.push({ kind: "project_data", label: "PRD", content: ctx.prd.content });
  if (ctx.decisions)
    segments.push({
      kind: "project_data",
      label: "decisions",
      content: ctx.decisions
        .map((d) => `#${d.number} ${d.question} -> ${d.selected}: ${d.reason}`)
        .join("\n"),
    });
  if (ctx.recommendations)
    segments.push({
      kind: "project_data",
      label: "recommendations",
      content: ctx.recommendations
        .map((r) => `${r.key}: ${r.value.label} (${r.source}). ${r.reason}`)
        .join("\n"),
    });
  if (ctx.memories)
    segments.push({
      kind: "project_data",
      label: "memory",
      content: ctx.memories.map((m) => `- ${m.title}: ${m.content}`).join("\n"),
    });
  if (ctx.summary)
    segments.push({ kind: "project_data", label: "conversation summary", content: ctx.summary });

  let used = 0;
  const kept: PromptSegment[] = [];
  for (const s of segments) {
    const room = BUDGET - used;
    if (room <= 200) break;
    const content =
      s.content.length > room ? `${s.content.slice(0, room)}\n[truncated]` : s.content;
    kept.push({ ...s, content });
    used += content.length;
  }
  return kept;
}
