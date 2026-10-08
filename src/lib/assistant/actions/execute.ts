import "server-only";
import { agentCan } from "@/lib/agents/capabilities";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permissions";
import type { Tx } from "@/lib/db/client";
import { createDecisionTx } from "@/lib/decisions/service";
import { appendDocumentSectionTx } from "@/lib/documents/service";
import type { AgentPermission } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import type { EventBatch } from "@/lib/events/emitter";
import type { Trace } from "@/lib/events/types";
import { createMemoryTx } from "@/lib/memory/service";
import { createRequirementTx, updateRequirementTx } from "@/lib/requirements/service";
import { createTaskTx, deleteTaskTx, updateTaskTx } from "@/lib/tasks/service";
import type { ExecutedItem } from "../blocks";
import { toolForAction } from "./tools";
import { type PlannedAction, plannedActions } from "./types";

export interface AssignRequest {
  taskId: string;
  agentId: string;
  instructions: string;
}

export interface ExecutionResult {
  items: ExecutedItem[];
  /** Agent assignments created, to be started after the transaction commits. */
  runs: string[];
}

/** Assigning agents lives in the agent orchestrator; it is injected to keep layers one-way. */
export type AssignFn = (
  tx: Tx,
  access: ProjectAccess,
  request: AssignRequest,
  trace: Trace,
  batch: EventBatch,
) => Promise<{ runId: string }>;

/**
 * Applies a validated plan inside the caller's transaction. The plan is re-parsed here (never
 * trust a stored or edited payload), the member's role is re-checked, and agent-originated
 * changes must also be covered by that agent's permissions.
 */
export async function executeActionsTx(
  tx: Tx,
  access: ProjectAccess,
  input: unknown,
  trace: Trace,
  batch: EventBatch,
  deps: { assign: AssignFn; agentPermissions?: AgentPermission[] },
): Promise<ExecutionResult> {
  const actions = plannedActions.parse(input) as PlannedAction[];
  if (!can(access.role, "content:write")) throw new AppError("AUTHORIZATION_ERROR");
  const base = `/project/${access.project.slug}`;
  const created: Record<string, string> = {};
  const result: ExecutionResult = { items: [], runs: [] };

  for (const action of actions) {
    const tool = toolForAction(action.type);
    if (!tool.available) throw new AppError("AUTHORIZATION_ERROR", `Tool ${tool.name} unavailable`);
    if (trace.via === "agent" && tool.agentPermission) {
      const perms = deps.agentPermissions ?? [];
      if (!agentCan({ permissions: perms }, tool.agentPermission))
        throw new AppError("AUTHORIZATION_ERROR", `Agent lacks ${tool.agentPermission}`);
    }

    switch (action.type) {
      case "CREATE_TASK": {
        const row = await createTaskTx(tx, access, action.payload, trace);
        created[action.key] = row.id;
        result.items.push({
          kind: "task",
          title: row.title,
          href: `${base}/tasks?task=${row.id}`,
          change: "created",
        });
        break;
      }
      case "UPDATE_TASK": {
        const row = await updateTaskTx(tx, access, action.payload, trace);
        result.items.push({
          kind: "task",
          title: row.title,
          href: `${base}/tasks?task=${row.id}`,
          change: "updated",
        });
        break;
      }
      case "DELETE_TASK": {
        const row = await deleteTaskTx(tx, access, action.payload.id, trace);
        result.items.push({
          kind: "task",
          title: row.title,
          href: `${base}/tasks`,
          change: "deleted",
        });
        break;
      }
      case "CREATE_REQUIREMENT": {
        const row = await createRequirementTx(tx, access, action.payload, trace);
        result.items.push({
          kind: "requirement",
          title: row.title,
          href: `${base}/requirements`,
          change: "created",
        });
        break;
      }
      case "UPDATE_REQUIREMENT": {
        const row = await updateRequirementTx(tx, access, action.payload, trace);
        result.items.push({
          kind: "requirement",
          title: row.title,
          href: `${base}/requirements`,
          change: "updated",
        });
        break;
      }
      case "APPEND_PRD": {
        await appendDocumentSectionTx(tx, access, { docSlug: "prd", ...action.payload }, trace);
        result.items.push({
          kind: "document",
          title: "PRD.md",
          href: `${base}/prd`,
          change: "updated",
        });
        break;
      }
      case "CREATE_MEMORY": {
        const row = await createMemoryTx(tx, access, action.payload, trace);
        result.items.push({
          kind: "memory",
          title: row.title,
          href: `${base}/memory`,
          change: "created",
        });
        break;
      }
      case "CREATE_DECISION": {
        const row = await createDecisionTx(tx, access, action.payload, trace);
        result.items.push({
          kind: "decision",
          title: `#${String(row.number).padStart(3, "0")} ${row.selected}`,
          href: `${base}/decisions`,
          change: "created",
        });
        break;
      }
      case "ASSIGN_AGENT": {
        if (action.skip) break;
        const ref = action.payload.task;
        const taskId = "id" in ref ? ref.id : created[ref.step];
        if (!taskId) throw new AppError("VALIDATION_ERROR", "Unknown task step");
        const { runId } = await deps.assign(
          tx,
          access,
          { taskId, agentId: action.payload.agentId, instructions: action.payload.instructions },
          trace,
          batch,
        );
        result.runs.push(runId);
        break;
      }
    }
  }
  return result;
}
