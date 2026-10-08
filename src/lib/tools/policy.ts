import { agentCan } from "@/lib/agents/capabilities";
import type { AgentPermission, MemberRole, ToolRisk, ToolTrust } from "@/lib/domain/enums";

/**
 * Who may run which tool. Pure, so the whole matrix is unit-tested.
 *   trust ≠ enabled → deny; critical → deny (not available in this phase);
 *   agents need the tool's permission; viewers may only run low-risk reads;
 *   high risk needs an approved proposal; low and medium run directly.
 */
export type ToolDecision =
  | { kind: "allow" }
  | { kind: "approval" }
  | { kind: "deny"; reason: "not_enabled" | "critical" | "agent_permission" | "role" };

export function decideTool(input: {
  risk: ToolRisk;
  trust: ToolTrust;
  role: MemberRole;
  agent?: { permissions: AgentPermission[] } | null;
  toolPermission: AgentPermission | null;
  approved?: boolean;
}): ToolDecision {
  if (input.trust !== "enabled") return { kind: "deny", reason: "not_enabled" };
  if (input.risk === "critical") return { kind: "deny", reason: "critical" };
  if (input.role === "viewer" && input.risk !== "low") return { kind: "deny", reason: "role" };
  if (input.agent && input.toolPermission && !agentCan(input.agent, input.toolPermission))
    return { kind: "deny", reason: "agent_permission" };
  if (input.risk === "high" && !input.approved) return { kind: "approval" };
  return { kind: "allow" };
}
