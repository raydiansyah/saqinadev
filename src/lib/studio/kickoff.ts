import "server-only";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { after } from "next/server";
import { inferRequiredCapabilities } from "@/lib/agents/capabilities";
import { assignAgentTx, startRun } from "@/lib/agents/orchestrator";
import { listAgentRegistry } from "@/lib/agents/registry";
import { selectAgent } from "@/lib/agents/selector";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { agentAssignments, milestones, tasks } from "@/lib/db/schema";
import { EventBatch } from "@/lib/events/emitter";
import { log } from "@/lib/log";

/** Tasks handed out per click: enough to get going, few enough to review. */
export const KICKOFF_LIMIT = 10;
/** Runs that start at the same time; the rest start as these finish. */
export const KICKOFF_PARALLEL = 3;

const OPEN_ASSIGNMENT = ["queued", "assigned", "running", "waiting", "blocked", "paused"] as const;

export interface KickoffResult {
  /** `agents`: Saqina builds, runs were started. `manual`: the team builds elsewhere. */
  mode: "agents" | "manual";
  started: number;
  /** Open tasks no Saqina agent covers; they stay for a person. */
  skipped: number;
}

/**
 * "Start building". When the project is built in Saqina, every open task without an agent is
 * given to the team agent whose role fits it best, and the runs start. Each run ends in a proposal
 * a person approves, so nothing reaches the project without review. A project built elsewhere
 * only opens the Studio. Clicking again never doubles a task: one already assigned is skipped.
 */
export async function startBuilding(actor: Actor, slug: string): Promise<KickoffResult> {
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  if (access.project.buildStrategy !== "saqina") return { mode: "manual", started: 0, skipped: 0 };

  const { agents, load } = await listAgentRegistry(access);
  const team = agents.filter((a) => a.type === "saqina" && a.role !== "general");
  const batch = new EventBatch();
  const { runIds, skipped } = await db.transaction(async (tx) => {
    const writer = await loadProjectAccess(actor, { id: access.project.id }, "content:write", tx);
    const busy = tx
      .select({ taskId: agentAssignments.taskId })
      .from(agentAssignments)
      .where(
        and(
          eq(agentAssignments.projectId, access.project.id),
          inArray(agentAssignments.status, [...OPEN_ASSIGNMENT]),
        ),
      );
    // Earliest milestone first, then the plan's own order.
    const open = await tx
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        phase: tasks.phase,
      })
      .from(tasks)
      .leftJoin(milestones, eq(milestones.id, tasks.milestoneId))
      .where(
        and(
          eq(tasks.projectId, access.project.id),
          inArray(tasks.status, ["backlog", "todo"]),
          notInArray(tasks.id, busy),
        ),
      )
      .orderBy(asc(milestones.position), asc(tasks.position))
      .limit(KICKOFF_LIMIT);

    const counts = { ...load };
    const ids: string[] = [];
    let missed = 0;
    for (const task of open) {
      const best = selectAgent({
        required: inferRequiredCapabilities(task),
        agents: team,
        load: counts,
        executableTypes: ["saqina"],
      });
      if (!best) {
        missed++;
        continue;
      }
      const { runId } = await assignAgentTx(
        tx,
        writer,
        {
          taskId: task.id,
          agentId: best.agent.id,
          instructions: "Started from the Studio: work on this task and propose the result.",
        },
        { via: "user" },
        batch,
      );
      counts[best.agent.id] = (counts[best.agent.id] ?? 0) + 1;
      ids.push(runId);
    }
    return { runIds: ids, skipped: missed };
  });
  batch.flush();
  await scheduleRuns(access, runIds);
  return { mode: "agents", started: runIds.length, skipped };
}

/** Starts the runs after the response, a few at a time. A run that fails stays visible as failed. */
async function scheduleRuns(access: ProjectAccess, runIds: string[]): Promise<void> {
  if (runIds.length === 0) return;
  const work = async () => {
    for (let i = 0; i < runIds.length; i += KICKOFF_PARALLEL) {
      await Promise.all(
        runIds
          .slice(i, i + KICKOFF_PARALLEL)
          .map((id) =>
            startRun(access, id).catch((error) =>
              log.warn("studio.run_failed", {
                error: error instanceof Error ? error.name : "error",
              }),
            ),
          ),
      );
    }
  };
  try {
    after(work);
  } catch {
    // Outside a request (a script or a test) the runs happen before this returns.
    await work();
  }
}
