import type { AgentPermission } from "@/lib/domain/enums";
import type { ActionType } from "./types";

/**
 * Tool catalogue. Every capability Saqina or an agent can use is declared here with the
 * permission it needs; execution always goes through the application, never raw model output.
 * Future tools are listed so the boundary is visible, but they are not available.
 */
export interface ToolDefinition {
  name: string;
  /** Internal action this tool maps to, if it writes. */
  action?: ActionType;
  category: "read" | "write" | "destructive" | "agent" | "external";
  /** Permission an agent needs to use this tool. Members need `content:write` for writes. */
  agentPermission?: AgentPermission;
  available: boolean;
}

export const TOOLS: readonly ToolDefinition[] = [
  { name: "read_project", category: "read", agentPermission: "read_project", available: true },
  { name: "read_prd", category: "read", agentPermission: "read_prd", available: true },
  { name: "search_memory", category: "read", agentPermission: "read_memory", available: true },
  {
    name: "create_task",
    action: "CREATE_TASK",
    category: "write",
    agentPermission: "write_tasks",
    available: true,
  },
  {
    name: "update_task",
    action: "UPDATE_TASK",
    category: "write",
    agentPermission: "write_tasks",
    available: true,
  },
  {
    name: "delete_task",
    action: "DELETE_TASK",
    category: "destructive",
    agentPermission: "write_tasks",
    available: true,
  },
  {
    name: "create_requirement",
    action: "CREATE_REQUIREMENT",
    category: "write",
    agentPermission: "write_requirements",
    available: true,
  },
  {
    name: "update_requirement",
    action: "UPDATE_REQUIREMENT",
    category: "write",
    agentPermission: "write_requirements",
    available: true,
  },
  {
    name: "update_prd",
    action: "APPEND_PRD",
    category: "write",
    agentPermission: "write_documents",
    available: true,
  },
  {
    name: "create_memory",
    action: "CREATE_MEMORY",
    category: "write",
    agentPermission: "write_memory",
    available: true,
  },
  {
    name: "create_decision",
    action: "CREATE_DECISION",
    category: "write",
    agentPermission: "write_memory",
    available: true,
  },
  { name: "assign_agent", action: "ASSIGN_AGENT", category: "agent", available: true },
  // Declared for later phases. Nothing can call these yet.
  { name: "git", category: "external", agentPermission: "git_push", available: false },
  { name: "browser", category: "external", available: false },
  { name: "filesystem", category: "external", available: false },
  { name: "mcp", category: "external", available: false },
  { name: "deploy", category: "external", agentPermission: "deploy", available: false },
];

export function toolForAction(type: ActionType): ToolDefinition {
  const tool = TOOLS.find((t) => t.action === type);
  if (!tool) throw new Error(`No tool for ${type}`);
  return tool;
}
