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
    name: "list_documents",
    description:
      "Project documents agents may read (PRD, PLAN and custom documents): slug, title, status, version.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    riskLevel: "low",
    agentPermission: "read_prd",
  },
  {
    source: "internal",
    name: "read_document",
    description:
      "Markdown of one document by slug, with its version. Use the version as baseVersion.",
    inputSchema: {
      type: "object",
      properties: { slug: str(64) },
      required: ["slug"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "read_prd",
  },
  {
    source: "internal",
    name: "propose_document_change",
    description:
      "Propose a new full text for a document. Nothing changes until a project member approves the diff in Saqina.",
    inputSchema: {
      type: "object",
      properties: {
        slug: str(64),
        content: str(200_000),
        baseVersion: { type: "integer", minimum: 1 },
        summary: { type: "string", maxLength: 300 },
      },
      required: ["slug", "content", "baseVersion"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "write_documents",
  },
  {
    source: "internal",
    name: "search_memory",
    description:
      "Approved project memory matching a query: ranked, with confidence and sources. Full text search only; no semantic matching.",
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
    source: "internal",
    name: "search_wiki",
    description:
      "Passages of the project documents (PRD, plan, custom documents, repository docs) matching a query, each with its source, heading and line range, and whether the source changed since it was read. Full text search only. Cite the passage; if nothing matches, say so.",
    inputSchema: {
      type: "object",
      properties: { query: str(200) },
      required: ["query"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "read_prd",
  },
  {
    source: "internal",
    name: "find_symbol",
    description:
      "Where a function, class, method, interface or type is defined in the repository (name, kind, file and lines), from the code graph at a stated commit. Static analysis: read the file before relying on it.",
    inputSchema: {
      type: "object",
      properties: {
        query: str(100),
        kind: {
          type: "string",
          enum: ["function", "class", "method", "interface", "type", "enum", "variable"],
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "read_repository",
  },
  {
    source: "internal",
    name: "find_callers",
    description:
      "What calls a symbol (id from find_symbol). Each caller is marked resolved (syntax and imports tie it to this symbol) or name_only (only the name matches, so it may be another symbol). Dynamic calls are not seen.",
    inputSchema: {
      type: "object",
      properties: { symbolId: str(64) },
      required: ["symbolId"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "read_repository",
  },
  {
    source: "internal",
    name: "file_impact",
    description:
      "Which files import a file, directly or through others, and which test files may be affected by changing it. Static analysis at a stated commit; check the revision and whether it is stale.",
    inputSchema: {
      type: "object",
      properties: { path: str(300) },
      required: ["path"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "read_repository",
  },
  {
    source: "internal",
    name: "search_skills",
    description:
      "Approved skills (reusable workflows) that fit a task, each with when to use it, when not to, the steps and how to check it worked. Full text search only. Use a skill only if its triggers fit and no exclusion applies.",
    inputSchema: {
      type: "object",
      properties: { query: str(200) },
      required: ["query"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "read_memory",
  },
  {
    source: "internal",
    name: "record_skill_outcome",
    description:
      "Say whether a skill worked when you used it (success, partial or failure), with a short note. This is how skills earn trust or get retired.",
    inputSchema: {
      type: "object",
      properties: {
        skillId: str(64),
        outcome: { type: "string", enum: ["success", "partial", "failure"] },
        note: str(300),
      },
      required: ["skillId", "outcome"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "write_memory",
  },
  {
    source: "internal",
    name: "read_memory",
    description:
      "One memory entry by id (from search_memory), with its full text and where it came from.",
    inputSchema: {
      type: "object",
      properties: { id: str(64) },
      required: ["id"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "read_memory",
  },
  {
    source: "internal",
    name: "get_changes",
    description:
      "What changed in the project after a revision (from read_project or an earlier call). Use it instead of re-reading everything.",
    inputSchema: {
      type: "object",
      properties: { sinceRevision: { type: "integer", minimum: 0 } },
      required: ["sinceRevision"],
      additionalProperties: false,
    },
    riskLevel: "low",
    agentPermission: "read_project",
  },
  {
    source: "internal",
    name: "read_doc_map",
    description:
      "Where the project's documents are and what each is for (PRD, plan, tasks, spec, memory, decision, process, client).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    riskLevel: "low",
    agentPermission: "read_project",
  },
  {
    source: "internal",
    name: "list_prd_findings",
    description: "Open places where the PRD and the rest of the project disagree.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    riskLevel: "low",
    agentPermission: "read_prd",
  },
  {
    source: "internal",
    name: "write_memory",
    description:
      "Propose one concise memory (a decision, constraint or lesson worth keeping). It waits for a person to approve it before anyone else can read it, never edits existing memory, and an identical entry is not added twice.",
    inputSchema: {
      type: "object",
      properties: {
        title: str(160),
        content: str(2000),
        category: {
          type: "string",
          enum: [
            "architecture",
            "product",
            "design",
            "technical",
            "business",
            "user_preference",
            "decision",
            "constraint",
            "integration",
          ],
        },
        importance: { type: "string", enum: ["high", "normal"] },
      },
      required: ["title", "content"],
      additionalProperties: false,
    },
    riskLevel: "medium",
    agentPermission: "write_memory",
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
