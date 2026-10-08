import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { agentRunEvents, agentRuns, agents, tasks } from "@/lib/db/schema";
import type { RunStatus } from "@/lib/domain/enums";
import type { RunRow } from "./orchestrator";

/** Read models for agent runs: lists, detail with timeline, and open runs per task. */

export interface RunView {
  run: RunRow;
  agentName: string;
  agentType: string;
  agentRole: string;
  taskTitle: string | null;
}

export async function listRuns(
  access: ProjectAccess,
  options: { limit?: number; ids?: string[] } = {},
): Promise<RunView[]> {
  if (options.ids && options.ids.length === 0) return [];
  const rows = await db
    .select({
      run: agentRuns,
      agentName: agents.name,
      agentType: agents.type,
      agentRole: agents.role,
      taskTitle: tasks.title,
    })
    .from(agentRuns)
    .innerJoin(agents, eq(agents.id, agentRuns.agentId))
    .leftJoin(tasks, eq(tasks.id, agentRuns.taskId))
    .where(
      and(
        eq(agentRuns.projectId, access.project.id),
        options.ids ? inArray(agentRuns.id, options.ids) : undefined,
      ),
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(options.limit ?? 20);
  return rows;
}

export async function getRunDetail(access: ProjectAccess, runId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return null;
  const [view] = await listRuns(access, { ids: [runId] });
  if (!view) return null;
  const events = await db
    .select()
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, runId))
    .orderBy(asc(agentRunEvents.createdAt));
  return { ...view, events };
}

/** Open runs per task, for task cards. */
export async function openRunsByTask(access: ProjectAccess) {
  const rows = await db
    .select({
      taskId: agentRuns.taskId,
      runId: agentRuns.id,
      status: agentRuns.status,
      agentName: agents.name,
    })
    .from(agentRuns)
    .innerJoin(agents, eq(agents.id, agentRuns.agentId))
    .where(
      and(
        eq(agentRuns.projectId, access.project.id),
        ne(agentRuns.status, "cancelled"),
        ne(agentRuns.status, "completed"),
      ),
    );
  const map: Record<string, { runId: string; status: RunStatus; agentName: string }> = {};
  for (const r of rows)
    if (r.taskId) map[r.taskId] = { runId: r.runId, status: r.status, agentName: r.agentName };
  return map;
}
