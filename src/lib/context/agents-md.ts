export interface AgentsMdInput {
  projectName: string;
  mcpEndpoint: string;
  repository: { fullName: string; defaultBranch: string; branchPrefix: string } | null;
  skills: { slug: string; name: string; description: string }[];
  connectors: { name: string; tools: string[] }[];
}

/**
 * The AGENTS.md a developer drops at the root of the repository, so an IDE agent (Claude Code,
 * Cursor, Codex, Kiro) works the way Saqina expects: tasks come from Saqina, code goes through
 * Git, results are reported back. Built from real project data; it holds no secret and no token.
 */
export function renderAgentsMd(input: AgentsMdInput): string {
  const base = input.repository?.defaultBranch ?? "main";
  const prefix = input.repository?.branchPrefix ?? "saqina/";
  const lines: string[] = [
    `# ${input.projectName}: working with Saqina Dev`,
    "",
    "This project is managed in Saqina Dev. Saqina holds the scope (PRD, plan), the tasks and the",
    "agreements; the code lives in this repository. Work here with your own model and tools, and keep",
    "Saqina in step as described below.",
    "",
    "## Connect",
    "",
    `MCP endpoint (Streamable HTTP, Bearer token): ${input.mcpEndpoint}`,
    "Create a token in Saqina under Settings > Agent access. Never put the token in this repository.",
    "",
    "## Workflow",
    "",
    "1. `list_tasks` (status `todo`), then `read_task` for the one you take. `read_prd` and",
    "   `read_document` give the scope; `search_memory` gives decisions already made.",
    "2. `claim_task`. It moves the task to in progress and returns the branch name to use.",
    `3. Work on a branch named \`${prefix}T-xxxxxxxx-short-title\` (the task reference from \`list_tasks\`).`,
    `   Never commit to \`${base}\` directly.`,
    "4. Open a pull request into " +
      `\`${base}\`` +
      " and put `Saqina-Task: T-xxxxxxxx` in its description. Saqina then links the branch, the pull",
    "   request and its checks to the task by itself.",
    "5. `report_task_result` with status `review` (ready for a person to check) or `blocked`, a short",
    "   summary and the pull request link. Only a person marks a task done: by merging the pull request",
    "   or approving it in Saqina.",
    "",
    "## Rules",
    "",
    "- Do not change the PRD or other documents by editing files and hoping they sync: use",
    "  `propose_document_change`; a project member approves the diff.",
    "- Record what the team should remember with `write_memory` (it waits for review).",
    "- Never commit secrets, tokens or `.env` files.",
    "- A tool that can change things outside Saqina waits for approval in Saqina; the call says so.",
    "",
  ];
  if (input.skills.length > 0) {
    lines.push(
      "## Skills",
      "",
      "Read one with `get_skill` and follow its method when it fits the task.",
      "",
    );
    for (const s of input.skills) lines.push(`- \`${s.slug}\`: ${s.name}. ${s.description}`);
    lines.push("");
  }
  if (input.connectors.length > 0) {
    lines.push(
      "## Connectors",
      "",
      "Use `list_connector_tools` to see them with their input, and `call_connector_tool` to run one.",
      "",
    );
    for (const c of input.connectors) lines.push(`- ${c.name}: ${c.tools.join(", ")}`);
    lines.push("");
  }
  if (input.repository)
    lines.push(
      "## Repository",
      "",
      `- ${input.repository.fullName} (default branch \`${base}\`)`,
      "",
    );
  return lines.join("\n");
}
