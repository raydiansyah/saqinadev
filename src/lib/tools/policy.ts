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
  | {
      kind: "deny";
      reason: "not_enabled" | "critical" | "agent_permission" | "role" | "tool_not_allowed";
    };

/**
 * A call that only touches the work branch of an execution: a commit to it, or creating it. This
 * is the one write an agent may do without an approval, because the branch is its own, is never
 * a protected branch, and nothing reaches the project until a person merges it.
 */
export function isWorkBranchCall(
  tool: { source: string; name: string },
  input: Record<string, unknown>,
  branch: string | null | undefined,
): boolean {
  if (!branch || tool.source !== "git") return false;
  if (tool.name === "commit_changes") return input.branch === branch;
  if (tool.name === "create_branch") return input.name === branch;
  return false;
}

export function decideTool(input: {
  risk: ToolRisk;
  trust: ToolTrust;
  role: MemberRole;
  agent?: { permissions: AgentPermission[] } | null;
  toolPermission: AgentPermission | null;
  approved?: boolean;
  /** The tool's name and the tools an execution froze for this agent. Outside the list: denied. */
  toolName?: string;
  allowedTools?: readonly string[] | null;
  /** The call is a commit to the execution's own work branch (see `isWorkBranchCall`). */
  workBranch?: boolean;
}): ToolDecision {
  if (input.trust !== "enabled") return { kind: "deny", reason: "not_enabled" };
  if (input.risk === "critical") return { kind: "deny", reason: "critical" };
  if (input.allowedTools && input.toolName && !input.allowedTools.includes(input.toolName))
    return { kind: "deny", reason: "tool_not_allowed" };
  if (input.role === "viewer" && input.risk !== "low") return { kind: "deny", reason: "role" };
  if (input.agent && input.toolPermission && !agentCan(input.agent, input.toolPermission))
    return { kind: "deny", reason: "agent_permission" };
  if (input.risk === "high" && !input.approved && !input.workBranch) return { kind: "approval" };
  return { kind: "allow" };
}
