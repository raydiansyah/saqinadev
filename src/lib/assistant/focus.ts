import type { PlannedAction } from "./actions/types";
import type { Intent } from "./intents/types";
import type { PlanOutcome } from "./planner";

/** Which part of the Studio work area a reply is about. */
export type WorkFocus = "plan" | "agents";

const PLAN_INTENTS: ReadonlySet<Intent> = new Set([
  "GENERATE_PLAN",
  "CREATE_TASK",
  "UPDATE_TASK",
  "COMPLETE_TASK",
  "DELETE_TASKS",
  "SPLIT_TASK",
  "ADD_FEATURE",
  "ANALYZE_TASKS",
]);
const PLAN_ACTIONS: ReadonlySet<PlannedAction["type"]> = new Set([
  "CREATE_TASK",
  "UPDATE_TASK",
  "DELETE_TASK",
]);
const AGENT_INTENTS: ReadonlySet<Intent> = new Set(["ASSIGN_AGENT", "RUN_AGENT", "HANDOFF_AGENT"]);

/**
 * Where the Studio work area should turn after a reply: a plan or tasks go to the Plan tab, agent
 * work to the Agents tab. A question back to the person keeps the area where it is.
 */
export function focusFor(intent: Intent, outcome: PlanOutcome): WorkFocus | null {
  if (outcome.kind === "clarify") return null;
  if (outcome.kind === "act" && outcome.actions.some((a) => a.type === "ASSIGN_AGENT"))
    return "agents";
  if (AGENT_INTENTS.has(intent)) return "agents";
  if (PLAN_INTENTS.has(intent)) return "plan";
  if (outcome.kind === "act" && outcome.actions.some((a) => PLAN_ACTIONS.has(a.type)))
    return "plan";
  return null;
}
