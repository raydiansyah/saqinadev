import "server-only";
import type { ProjectAccess } from "@/lib/auth/permissions";
import type { AgentRole, AgentType } from "@/lib/domain/enums";
import { EXECUTABLE_TYPES, listAgentRegistry } from "./registry";

/** What the UI needs to offer an agent choice: no configuration, no permissions detail. */
export interface AgentOption {
  id: string;
  name: string;
  role: AgentRole;
  type: AgentType;
  executable: boolean;
}

export async function agentOptions(access: ProjectAccess): Promise<AgentOption[]> {
  const { agents } = await listAgentRegistry(access);
  return agents
    .filter((a) => a.status !== "disabled")
    .map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      type: a.type,
      executable: EXECUTABLE_TYPES.includes(a.type),
    }));
}
