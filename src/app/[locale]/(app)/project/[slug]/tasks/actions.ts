"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { runAction } from "@/lib/actions";
import { inferRequiredCapabilities } from "@/lib/agents/capabilities";
import { assignAgentTx, startRun } from "@/lib/agents/orchestrator";
import { EXECUTABLE_TYPES, listAgentRegistry } from "@/lib/agents/registry";
import { rankAgents } from "@/lib/agents/selector";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { requireActor } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import type { AgentType } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { createTask, updateTask } from "@/lib/tasks/service";
import { parse } from "@/lib/validation";

// Refresh the whole project layout so the header's next action follows task changes.
const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function createTaskAction(slug: string, input: unknown) {
  return runAction("task.create", { slug }, async () => {
    const row = await createTask(await requireActor(), slug, input);
    refresh();
    return { id: row.id };
  });
}

/** Edits, moves, completes and reopens; the service keeps completedAt in sync with status. */
export async function updateTaskAction(slug: string, input: unknown) {
  return runAction("task.update", { slug }, async () => {
    const row = await updateTask(await requireActor(), slug, input);
    refresh();
    return { id: row.id, status: row.status };
  });
}

const suggestInput = z.object({ taskId: z.uuid() });

/** Top three agents for a task, with the reasons the selector gave. Nothing is written. */
export async function suggestAgentsAction(slug: string, input: unknown) {
  return runAction("task.suggestAgents", { slug }, async () => {
    const { taskId } = parse(suggestInput, input);
    const access = await loadProjectAccess(await requireActor(), { slug }, "content:write");
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.projectId, access.project.id)));
    if (!task) throw new AppError("NOT_FOUND");
    const required = inferRequiredCapabilities(task);
    const registry = await listAgentRegistry(access);
    const ranked = rankAgents({
      required,
      agents: registry.agents,
      load: registry.load,
      preferredType: access.project.preferredAgent as AgentType | null,
      executableTypes: EXECUTABLE_TYPES,
    });
    return {
      required,
      suggestions: ranked.slice(0, 3).map(({ agent, reasons }) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        executable: EXECUTABLE_TYPES.includes(agent.type),
        reasons,
      })),
    };
  });
}

const assignInput = z.object({
  taskId: z.uuid(),
  agentId: z.uuid(),
  instructions: z.string().trim().max(2000).default(""),
});

/** The user's click is the approval: assigns in one transaction, then starts the run. */
export async function assignAgentAction(slug: string, input: unknown) {
  return runAction("task.assignAgent", { slug }, async () => {
    const data = parse(assignInput, input);
    const actor = await requireActor();
    const batch = new EventBatch();
    const { access, runId } = await db.transaction(async (tx) => {
      const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
      const { runId } = await assignAgentTx(tx, access, data, { via: "user" }, batch);
      return { access, runId };
    });
    batch.flush();
    await startRun(access, runId);
    refresh();
    return { runId };
  });
}
