import type { ApprovalPolicy, MemberRole } from "@/lib/domain/enums";
import { ACTION_POLICY, type PlannedAction } from "./types";

/** More than this many writes at once is a plan worth reviewing, even if each is low risk. */
const AUTO_BATCH_LIMIT = 2;

export type ExecutionMode = "auto" | "proposal" | "forbidden";

/**
 * Decides how a plan runs. Viewers can never mutate; DESTRUCTIVE, AGENT and EXTERNAL actions
 * (and requirement or PRD changes) always need a human approval, whatever the project policy.
 */
export function executionMode(
  actions: PlannedAction[],
  policy: ApprovalPolicy,
  role: MemberRole,
): ExecutionMode {
  if (role === "viewer") return "forbidden";
  if (policy === "always") return "proposal";
  if (actions.length > AUTO_BATCH_LIMIT) return "proposal";
  return actions.every((a) => ACTION_POLICY[a.type].autoEligible) ? "auto" : "proposal";
}

/**
 * Applies reviewer edits to a stored plan. Only whitelisted fields of existing steps change;
 * steps cannot be added, reordered or retargeted, and optional steps may be skipped.
 */
export function applyEdits(
  actions: PlannedAction[],
  edits: Record<string, Record<string, unknown>>,
): unknown[] {
  return actions.map((action) => {
    const edit = edits[action.key];
    if (!edit) return action;
    const allowed = ACTION_POLICY[action.type].editable;
    const payload: Record<string, unknown> = { ...action.payload };
    for (const [field, value] of Object.entries(edit)) {
      if (allowed.includes(field)) payload[field] = value;
    }
    const next: Record<string, unknown> = { ...action, payload };
    if (action.type === "ASSIGN_AGENT" && action.optional && typeof edit.skip === "boolean")
      next.skip = edit.skip;
    return next;
  });
}
