import "server-only";
import { db } from "@/lib/db/client";
import { log } from "@/lib/log";
import { resolveSkillLoadout, retrieveSkills, type SkillHit } from "./retrieve";
import { recordSkillUse } from "./usage";

const MAX_SKILLS = 4;

/**
 * The skills an agent starts a run with: the ones bound to it or to its role, then the best matches
 * for the task. Only approved skills the agent may read, shared with the project or granted to it.
 * Each one is recorded as used by this run, and the run's result later becomes its outcome.
 */
export async function skillsForRun(
  projectId: string,
  agent: { id: string; role: string; permissions: string[] },
  run: { id: string },
  taskText: string,
): Promise<SkillHit[]> {
  if (!agent.permissions.includes("read_memory")) return [];
  const principal = {
    kind: "agent" as const,
    agentId: agent.id,
    creatorId: "",
    canReadMemory: true,
  };
  const [own, byRole, matched] = await Promise.all([
    resolveSkillLoadout(principal, projectId, { type: "agent", id: agent.id }),
    resolveSkillLoadout(principal, projectId, { type: "agent_role", id: agent.role }),
    retrieveSkills(principal, projectId, { query: taskText, limit: 3 }),
  ]);
  const seen = new Set<string>();
  const hits = [...own, ...byRole, ...matched]
    .filter((h) => !seen.has(h.assetId) && seen.add(h.assetId))
    .slice(0, MAX_SKILLS);
  for (const h of hits) {
    // A skill deleted a moment ago, or any problem recording, never fails the run.
    try {
      await db.transaction((tx) =>
        recordSkillUse(tx, {
          assetId: h.assetId,
          projectId,
          skillVersion: h.version,
          agentId: agent.id,
          runId: run.id,
        }),
      );
    } catch (error) {
      log.warn("skills.use_not_recorded", {
        projectId,
        error: error instanceof Error ? error.name : "error",
      });
    }
  }
  return hits;
}
