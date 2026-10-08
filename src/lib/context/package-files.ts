import { agentCan } from "@/lib/agents/capabilities";
import type { AgentPermission } from "@/lib/domain/enums";

/** Which package files need which read permission. TASK.md is the job itself. */
export const PACKAGE_FILE_NEEDS: Record<string, AgentPermission | null> = {
  "PROJECT.md": "read_project",
  "PRD.md": "read_prd",
  "PLAN.md": "read_tasks",
  "TASKS.md": "read_tasks",
  "MEMORY.md": "read_memory",
  "DECISIONS.md": "read_memory",
  "REPOSITORY.md": "read_repository",
  "TASK.md": null,
};

/** Files an agent would receive, for previews before anything is built or sent. */
export function packageFilesFor(
  permissions: AgentPermission[],
  options: { task: boolean; repository: boolean },
): string[] {
  return Object.entries(PACKAGE_FILE_NEEDS)
    .filter(([name]) =>
      name === "TASK.md" ? options.task : name === "REPOSITORY.md" ? options.repository : true,
    )
    .filter(([, need]) => !need || agentCan({ permissions }, need))
    .map(([name]) => name);
}
