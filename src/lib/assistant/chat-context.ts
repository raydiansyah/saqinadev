import "server-only";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permissions";
import { isPlatformOwner } from "@/lib/platform/roles";
import { listUsableSkills, type UsableSkill } from "@/lib/skills/service";
import { availableTools } from "./tool-turn";

export interface ChatContextOptions {
  skills: UsableSkill[];
  connectors: { id: string; name: string; tools: string[] }[];
  /** Where this person can manage connectors, if anywhere. */
  manage: { platform: boolean; project: boolean };
}

/**
 * What the composer's "Add context" menu offers: switched-on skills and the connectors whose
 * tools this project can use. Names only; skill text and keys never reach the browser.
 */
export async function chatContextOptions(access: ProjectAccess): Promise<ChatContextOptions> {
  const [skills, tools, platform] = await Promise.all([
    listUsableSkills(),
    availableTools(access, []),
    isPlatformOwner(access.actor),
  ]);
  const byConnector = new Map<string, { id: string; name: string; tools: string[] }>();
  for (const t of tools) {
    const entry = byConnector.get(t.connectorId) ?? {
      id: t.connectorId,
      name: t.connector,
      tools: [],
    };
    entry.tools.push(t.name);
    byConnector.set(t.connectorId, entry);
  }
  return {
    skills,
    connectors: [...byConnector.values()],
    manage: { platform, project: can(access.role, "project:update") },
  };
}
