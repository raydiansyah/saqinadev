import "server-only";
import { availableTools } from "@/lib/assistant/tool-turn";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { renderAgentsMd } from "@/lib/context/agents-md";
import { siteBase } from "@/lib/email/layout";
import { getRepository } from "@/lib/git/service";
import { listUsableSkills } from "@/lib/skills/service";

/** The project's AGENTS.md, from live data: repository, skills switched on, connectors set up. */
export async function agentsMdFor(access: ProjectAccess): Promise<string> {
  const [repo, skills, tools] = await Promise.all([
    getRepository(access),
    listUsableSkills(),
    availableTools(access, []),
  ]);
  const byConnector = new Map<string, string[]>();
  for (const t of tools)
    byConnector.set(t.connector, [...(byConnector.get(t.connector) ?? []), t.name]);
  const connected =
    repo && repo.status !== "disconnected" && repo.provider !== "custom_local" ? repo : null;
  return renderAgentsMd({
    projectName: access.project.name,
    mcpEndpoint: `${siteBase()}/api/projects/${access.project.slug}/mcp`,
    repository: connected
      ? {
          fullName: connected.fullName,
          defaultBranch: connected.defaultBranch,
          branchPrefix: connected.agentBranchPrefix,
        }
      : null,
    skills,
    connectors: [...byConnector].map(([name, names]) => ({ name, tools: names })),
  });
}
