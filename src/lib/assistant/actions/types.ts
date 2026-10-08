import * as z from "zod";
import {
  type ActionCategory,
  MEMORY_CATEGORIES,
  PRIORITIES,
  REQUIREMENT_GROUPS,
  REQUIREMENT_STATUSES,
  type RiskLevel,
  TASK_STATUSES,
} from "@/lib/domain/enums";

/**
 * The only shapes Saqina can execute. Planner output, model output and edited proposals are
 * all re-parsed against this union before anything touches the database.
 */

const title = z.string().trim().min(2).max(200);
const id = z.uuid();

/** Points at a task: an existing one, or one created earlier in the same plan. */
const taskRef = z.union([z.object({ id }), z.object({ step: z.string().min(1).max(8) })]);

export const plannedAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("CREATE_TASK"),
    key: z.string().min(1).max(8),
    payload: z.object({
      title,
      description: z.string().trim().max(4000).default(""),
      priority: z.enum(PRIORITIES).default("medium"),
      status: z.enum(TASK_STATUSES).default("todo"),
      milestoneId: id.nullable().default(null),
    }),
  }),
  z.object({
    type: z.literal("UPDATE_TASK"),
    key: z.string().min(1).max(8),
    payload: z.object({
      id,
      title: title.optional(),
      description: z.string().trim().max(4000).optional(),
      priority: z.enum(PRIORITIES).optional(),
      status: z.enum(TASK_STATUSES).optional(),
    }),
    before: z.object({ title: z.string(), priority: z.string(), status: z.string() }),
  }),
  z.object({
    type: z.literal("DELETE_TASK"),
    key: z.string().min(1).max(8),
    payload: z.object({ id }),
    before: z.object({ title: z.string(), status: z.string() }),
  }),
  z.object({
    type: z.literal("CREATE_REQUIREMENT"),
    key: z.string().min(1).max(8),
    payload: z.object({
      group: z.enum(REQUIREMENT_GROUPS),
      title: z.string().trim().min(2).max(160),
      description: z.string().trim().max(2000),
      priority: z.enum(PRIORITIES),
      status: z.enum(REQUIREMENT_STATUSES),
    }),
  }),
  z.object({
    type: z.literal("UPDATE_REQUIREMENT"),
    key: z.string().min(1).max(8),
    payload: z.object({
      id,
      description: z.string().trim().max(2000).optional(),
      priority: z.enum(PRIORITIES).optional(),
      status: z.enum(REQUIREMENT_STATUSES).optional(),
    }),
    before: z.object({
      title: z.string(),
      description: z.string(),
      priority: z.string(),
      status: z.string(),
    }),
  }),
  z.object({
    type: z.literal("APPEND_PRD"),
    key: z.string().min(1).max(8),
    payload: z.object({
      heading: z.string().trim().min(2).max(120),
      body: z.string().trim().min(2).max(6000),
    }),
  }),
  z.object({
    type: z.literal("CREATE_MEMORY"),
    key: z.string().min(1).max(8),
    payload: z.object({
      title: z.string().trim().min(2).max(160),
      content: z.string().trim().min(1).max(4000),
      category: z.enum(MEMORY_CATEGORIES),
      importance: z.enum(["high", "normal"]).default("normal"),
    }),
  }),
  z.object({
    type: z.literal("CREATE_DECISION"),
    key: z.string().min(1).max(8),
    payload: z
      .object({
        question: z.string().trim().min(5).max(300),
        context: z.string().trim().max(2000).default(""),
        options: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
        selected: z.string().trim().min(1).max(160),
        reason: z.string().trim().min(3).max(2000),
      })
      .refine((d) => d.options.includes(d.selected), { path: ["selected"] }),
  }),
  z.object({
    type: z.literal("CREATE_HANDOFF"),
    key: z.string().min(1).max(8),
    payload: z.object({
      agentId: id,
      taskId: id.nullable(),
      instructions: z.string().trim().max(4000).default(""),
      format: z.enum(["markdown", "json", "prompt"]).default("prompt"),
    }),
    display: z.object({
      agent: z.string().max(80),
      task: z.string().max(200).nullable(),
      files: z.array(z.string().max(40)).max(12),
    }),
  }),
  z.object({
    type: z.literal("RUN_TOOL"),
    key: z.string().min(1).max(8),
    payload: z.object({
      tool: z.string().min(1).max(200),
      input: z.record(z.string(), z.unknown()),
      idempotencyKey: z.string().min(8).max(200),
    }),
    /** For the review card only; the executor re-reads the tool from the registry. */
    display: z.object({
      name: z.string().max(80),
      source: z.string().max(20),
      risk: z.string().max(20),
    }),
  }),
  z.object({
    type: z.literal("ASSIGN_AGENT"),
    key: z.string().min(1).max(8),
    /** Optional steps can be switched off in the proposal before approving. */
    optional: z.boolean().default(false),
    skip: z.boolean().default(false),
    payload: z.object({
      task: taskRef,
      agentId: id,
      instructions: z.string().trim().max(2000).default(""),
    }),
  }),
]);
export type PlannedAction = z.infer<typeof plannedAction>;
export type ActionType = PlannedAction["type"];

export const plannedActions = z.array(plannedAction).min(1).max(30);

interface ActionPolicy {
  category: ActionCategory;
  risk: RiskLevel;
  /** Low-risk internal writes may run without a proposal when the project allows it. */
  autoEligible: boolean;
  /** Fields a reviewer may change before approving. Everything else is fixed. */
  editable: readonly string[];
}

export const ACTION_POLICY: Record<ActionType, ActionPolicy> = {
  CREATE_TASK: {
    category: "write",
    risk: "low",
    autoEligible: true,
    editable: ["title", "description", "priority"],
  },
  UPDATE_TASK: { category: "write", risk: "low", autoEligible: true, editable: ["priority"] },
  DELETE_TASK: { category: "destructive", risk: "high", autoEligible: false, editable: [] },
  CREATE_REQUIREMENT: {
    category: "write",
    risk: "medium",
    autoEligible: false,
    editable: ["title", "description", "priority"],
  },
  UPDATE_REQUIREMENT: {
    category: "write",
    risk: "medium",
    autoEligible: false,
    editable: ["description", "priority"],
  },
  APPEND_PRD: { category: "write", risk: "medium", autoEligible: false, editable: ["body"] },
  CREATE_MEMORY: {
    category: "write",
    risk: "low",
    autoEligible: true,
    editable: ["title", "content"],
  },
  CREATE_DECISION: { category: "write", risk: "low", autoEligible: true, editable: ["reason"] },
  RUN_TOOL: { category: "external", risk: "high", autoEligible: false, editable: [] },
  CREATE_HANDOFF: {
    category: "external",
    risk: "medium",
    autoEligible: false,
    editable: ["instructions"],
  },
  ASSIGN_AGENT: {
    category: "agent",
    risk: "medium",
    autoEligible: false,
    editable: ["agentId", "instructions"],
  },
};

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high"];
const CATEGORY_ORDER: ActionCategory[] = ["read", "write", "agent", "external", "destructive"];

/** The most serious category and risk across a plan, used to label the proposal. */
export function summarizeRisk(actions: PlannedAction[]): {
  category: ActionCategory;
  risk: RiskLevel;
} {
  let risk: RiskLevel = "low";
  let category: ActionCategory = "read";
  for (const action of actions) {
    const policy = ACTION_POLICY[action.type];
    if (RISK_ORDER.indexOf(policy.risk) > RISK_ORDER.indexOf(risk)) risk = policy.risk;
    if (CATEGORY_ORDER.indexOf(policy.category) > CATEGORY_ORDER.indexOf(category))
      category = policy.category;
  }
  return { category, risk };
}
