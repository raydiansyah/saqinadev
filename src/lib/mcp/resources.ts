import "server-only";
import { agentCan } from "@/lib/agents/capabilities";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { buildContextPackage } from "@/lib/context/package";
import type { AgentPermission } from "@/lib/domain/enums";
import { listUsableSkills, platformSkillsBySlugs } from "@/lib/skills/service";
import { agentsMdFor } from "./setup";

/**
 * What an IDE agent can read as a resource: the project's AGENTS.md, the skills switched on, and the
 * context package files its token allows (PRD, PLAN, TASKS, ...). The same permission filter as the
 * tools applies, and secrets are masked.
 */

type Agent = { permissions: AgentPermission[] };
const URI = /^saqina:\/\/(agents|skills|context)\/([A-Za-z0-9._-]{1,80})$/;

export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: "text/markdown";
}

export async function listResources(access: ProjectAccess, agent: Agent): Promise<McpResource[]> {
  const out: McpResource[] = [];
  if (agentCan(agent, "read_project"))
    out.push({
      uri: "saqina://agents/AGENTS.md",
      name: "AGENTS.md",
      description: "How to work with this project from a local IDE.",
      mimeType: "text/markdown",
    });
  if (agentCan(agent, "read_project"))
    for (const s of await listUsableSkills())
      out.push({
        uri: `saqina://skills/${s.slug}`,
        name: s.name,
        description: s.description,
        mimeType: "text/markdown",
      });
  const pkg = await buildContextPackage(access, { agent });
  for (const f of pkg.files)
    out.push({
      uri: `saqina://context/${f.name}`,
      name: f.name,
      description: "Project context file.",
      mimeType: "text/markdown",
    });
  return out;
}

export async function readResource(
  access: ProjectAccess,
  agent: Agent,
  uri: string,
): Promise<string | null> {
  const m = URI.exec(uri);
  if (!m) return null;
  const [, kind, name] = m;
  if (kind === "agents")
    return name === "AGENTS.md" && agentCan(agent, "read_project") ? agentsMdFor(access) : null;
  if (kind === "skills") {
    if (!agentCan(agent, "read_project")) return null;
    const [skill] = await platformSkillsBySlugs([name]);
    return skill ? skill.content : null;
  }
  const pkg = await buildContextPackage(access, { agent });
  return pkg.files.find((f) => f.name === name)?.content ?? null;
}
