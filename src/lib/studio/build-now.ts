import "server-only";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { startExecution } from "@/lib/executions/service";

export type BuildNowResult =
  /** The agents were started: a Build execution exists and the Studio follows it. */
  | { mode: "agents"; executionId: string }
  /** The team builds elsewhere: there is nothing for Saqina's agents to do. */
  | { mode: "manual" };

/**
 * "Start building" on an approved document: a real Build execution, the same one the Studio's
 * Build mode starts, so the chat, the plan and the agents all show it live.
 */
export async function buildNow(
  actor: Actor,
  slug: string,
  request: string,
): Promise<BuildNowResult> {
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  if (access.project.buildStrategy !== "saqina") return { mode: "manual" };
  const execution = await startExecution(actor, slug, { mode: "build", request });
  return { mode: "agents", executionId: execution.id };
}
