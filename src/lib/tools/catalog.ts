import type { AgentPermission, ToolRisk, ToolSource } from "@/lib/domain/enums";
import type { Schema } from "./json-schema";

/**
 * Built-in tools (Saqina's own reads and the normalised Git operations). MCP tools are
 * discovered at runtime and stored next to these in the `tools` table.
 */
export interface StaticTool {
  source: Exclude<ToolSource, "mcp">;
  name: string;
  description: string;
  inputSchema: Schema;
  riskLevel: ToolRisk;
  agentPermission: AgentPermission | null;
}

const str = (maxLength = 500): Schema => ({ type: "string", minLength: 1, maxLength });

export const STATIC_TOOLS: StaticTool[] = [
  {
    source: "internal",
    name: "read_project",
    description: "Project summary: name, status, stack, counts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    riskLevel: "low",
    agentPermission: "read_project",
  },
  {
    source: "internal",
    name: "read_prd",
    description: "Current PRD markdown.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    riskLevel: "low",
    agentPermission: "read_prd",
  },
  {
    source: "internal",
    name: "search_memory",
    description: "Project memory entries matching a query.",
    inputSchema: {
      type: "object",
      properties: { query: str(120) },
      required: ["query"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "read_memory",
  },
  {
    source: "git",
    name: "list_branches",
    description: "Branches of the connected repository.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    riskLevel: "low",
    agentPermission: "read_repository",
  },
  {
    source: "git",
    name: "list_files",
    description: "Files and folders at a path.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", maxLength: 300 }, ref: str(120) },
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "read_repository",
  },
  {
    source: "git",
    name: "read_file",
    description: "Contents of one file (text, up to 200 KB).",
    inputSchema: {
      type: "object",
      properties: { path: str(300), ref: str(120) },
      required: ["path"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "read_repository",
  },
  {
    source: "git",
    name: "search_code",
    description: "Search code in the repository.",
    inputSchema: {
      type: "object",
      properties: { query: str(120) },
      required: ["query"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "read_repository",
  },
  {
    source: "git",
    name: "create_branch",
    description: "Create a working branch under the agent prefix.",
    inputSchema: {
      type: "object",
      properties: { name: str(120) },
      required: ["name"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "write_branch",
  },
  {
    source: "git",
    name: "commit_changes",
    description: "Commit file changes to a working branch.",
    inputSchema: {
      type: "object",
      properties: {
        branch: str(120),
        message: str(300),
        files: {
          type: "array",
          maxItems: 50,
          items: {
            type: "object",
            properties: { path: str(300), content: { type: "string", maxLength: 200_000 } },
            required: ["path", "content"],
            additionalProperties: false,
          },
        },
      },
      required: ["branch", "message", "files"],
      additionalProperties: false,
    },
    riskLevel: "high",
    agentPermission: "write_branch",
  },
  {
    source: "git",
    name: "create_pull_request",
    description: "Open a pull request from a working branch.",
    inputSchema: {
      type: "object",
      properties: {
        branch: str(120),
        title: str(200),
        body: { type: "string", maxLength: 10_000 },
      },
      required: ["branch", "title"],
      additionalProperties: false,
    },
    riskLevel: "high",
    agentPermission: "write_branch",
  },
  {
    source: "git",
    name: "merge_branch",
    description: "Merge into the default branch. Not available in this phase.",
    inputSchema: { type: "object", properties: { branch: str(120) }, required: ["branch"] },
    riskLevel: "critical",
    agentPermission: "git_push",
  },
];

export const toolKey = (source: ToolSource, connectionId: string | null, name: string) =>
  `${source}:${connectionId ?? "-"}:${name}`;
