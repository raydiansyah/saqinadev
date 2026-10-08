import "server-only";
import { createHash } from "node:crypto";
import { agentCan } from "@/lib/agents/capabilities";
import type { ProjectAccess } from "@/lib/auth/permissions";
import type { AgentPermission, HandoffFormat } from "@/lib/domain/enums";
import { getRepository } from "@/lib/git/service";
import { getTechStack } from "@/lib/projects/stack";
import { scrubSecrets } from "@/lib/secrets/scan";
import { PACKAGE_FILE_NEEDS } from "./package-files";
import { serializeContext } from "./serialize";
import { getProjectContext } from "./service";

/**
 * Context package handed to an external agent. Versioned (project context revision + repo
 * head) so Saqina can later tell "the agent saw v12, the project is at v15". Files the agent
 * may not read are left out, and every file is scrubbed for secrets.
 */

export interface PackageMeta {
  project: string;
  projectName: string;
  contextVersion: number;
  generatedAt: string;
  sourceRevision: string | null;
}

export interface ContextPackage {
  meta: PackageMeta;
  files: { name: string; content: string }[];
  excluded: string[];
  redactions: number;
  hash: string;
}

const NEEDS = PACKAGE_FILE_NEEDS;

export async function buildContextPackage(
  access: ProjectAccess,
  options: {
    agent?: { permissions: AgentPermission[] } | null;
    task?: { title: string; description: string; priority: string; status: string } | null;
    instructions?: string;
  } = {},
): Promise<ContextPackage> {
  const [context, stack, repo] = await Promise.all([
    getProjectContext(access),
    getTechStack(access),
    getRepository(access),
  ]);
  const serialized = serializeContext(context);
  const stackLines = Object.entries(stack).map(([k, v]) => `- ${k}: ${v?.value} (${v?.source})`);
  const all: Record<string, string> = {
    ...serialized,
    "PROJECT.md": `${serialized["PROJECT.md"]}\n\n## Tech stack\n\n${stackLines.join("\n") || "_Not set._"}\n`,
  };
  if (options.task) {
    all["TASK.md"] = [
      `# Task: ${options.task.title}`,
      `- Priority: ${options.task.priority}`,
      `- Status: ${options.task.status}`,
      "",
      options.task.description || "_No description._",
      "",
      "## Instructions",
      options.instructions?.trim() || "_None._",
    ].join("\n");
  }
  if (repo && repo.status !== "disconnected") {
    all["REPOSITORY.md"] = [
      `# Repository`,
      `- Provider: ${repo.provider}`,
      `- Repository: ${repo.provider === "custom_local" ? "(local repository)" : repo.fullName}`,
      `- Default branch: ${repo.defaultBranch}`,
      repo.developmentBranch ? `- Development branch: ${repo.developmentBranch}` : "",
      `- Agent branches: ${repo.agentBranchPrefix}*  (never write to the default branch)`,
      `- Head: ${repo.headSha ?? "unknown"}`,
      "",
      "## Detected stack",
      Object.entries(repo.detectedStack)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n") || "_Not detected._",
    ]
      .filter((l) => l !== "")
      .join("\n");
  }

  const files: ContextPackage["files"] = [];
  const excluded: string[] = [];
  let redactions = 0;
  for (const [name, content] of Object.entries(all)) {
    const need = NEEDS[name] ?? "read_project";
    if (options.agent && need && !agentCan(options.agent, need)) {
      excluded.push(name);
      continue;
    }
    const clean = scrubSecrets(content);
    if (clean !== content) redactions++;
    files.push({ name, content: clean });
  }
  const meta: PackageMeta = {
    project: access.project.slug,
    projectName: access.project.name,
    contextVersion: access.project.contextRevision,
    generatedAt: new Date().toISOString(),
    sourceRevision: repo?.headSha ?? null,
  };
  const hash = createHash("sha256").update(JSON.stringify(files)).digest("hex").slice(0, 16);
  return { meta, files, excluded, redactions, hash };
}

/** Renders a package in the format the target agent expects. */
export function renderPackage(
  pkg: ContextPackage,
  format: HandoffFormat,
  instructions = "",
): string {
  if (format === "json")
    return JSON.stringify({ ...pkg.meta, instructions, files: pkg.files }, null, 2);
  const header = [
    `<!-- Saqina Dev context package`,
    `project: ${pkg.meta.project}`,
    `contextVersion: ${pkg.meta.contextVersion}`,
    `generatedAt: ${pkg.meta.generatedAt}`,
    `sourceRevision: ${pkg.meta.sourceRevision ?? "none"}`,
    `hash: ${pkg.hash} -->`,
  ].join("\n");
  const body = pkg.files.map((f) => `<!-- FILE: ${f.name} -->\n${f.content.trim()}`).join("\n\n");
  if (format === "prompt")
    return [
      header,
      "You are working on the project described below. Follow TASK.md. Propose changes on a working branch; do not merge or deploy.",
      instructions ? `Instructions:\n${instructions}` : "",
      'When you finish, report back as JSON: {"status": "completed|failed", "summary": "", "changes": [], "artifacts": [], "issues": [], "suggestions": []}',
      body,
    ]
      .filter(Boolean)
      .join("\n\n");
  return `${header}\n\n${body}\n`;
}
