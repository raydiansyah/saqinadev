import type { ContextFile, ProjectContext } from "./types";

/**
 * Serialises a project context into the Markdown files an agent reads. Structure and
 * headings are English (a stable format for tools); content stays in the project language.
 */

const list = (items: string[], empty = "_None._") => (items.length > 0 ? items.join("\n") : empty);
const day = (d: Date) => d.toISOString().slice(0, 10);

function projectFile(c: ProjectContext): string {
  const p = c.project;
  const groups = new Map<string, ProjectContext["requirements"]>();
  for (const r of c.requirements) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  const openItems = c.requirements.filter(
    (r) => r.status === "unknown" || r.status === "conflicting",
  );

  return [
    `# ${p.name}`,
    p.description,
    [
      `- Slug: \`${p.slug}\``,
      `- Status: ${p.status}`,
      ...(p.type ? [`- Type: ${p.type}`] : []),
      ...(p.complexity ? [`- Complexity: ${p.complexity}`] : []),
      ...(p.platform ? [`- Platform: ${p.platform}`] : []),
      ...(p.buildStrategy
        ? [
            `- Build strategy: ${p.buildStrategy}${p.preferredAgent ? ` (${p.preferredAgent})` : ""}`,
          ]
        : []),
      `- Language: ${p.locale}`,
      `- Updated: ${day(p.updatedAt)}`,
    ].join("\n"),
    "## Recommended approach",
    list(
      c.recommendations.map(
        (r) => `- **${r.key}:** ${r.value} (${r.confidence}, ${r.source}). ${r.reason}`,
      ),
    ),
    "## Requirements",
    ...[...groups.entries()]
      .filter(([g]) => g !== "open_questions")
      .flatMap(([group, items]) => [
        `### ${group}`,
        items
          .map((r) => `- [${r.status}] ${r.title}: ${r.description} (${r.priority}, ${r.source})`)
          .join("\n"),
      ]),
    "## Open questions",
    list(openItems.map((r) => `- [${r.status}] ${r.title}: ${r.description}`)),
    ...(c.documents.length > 0
      ? [
          "## Other documents",
          c.documents.map((d) => `- ${d.title} (\`${d.slug.toUpperCase()}.md\`)`).join("\n"),
        ]
      : []),
  ].join("\n\n");
}

function tasksFile(c: ProjectContext): string {
  const order = ["blocked", "in_progress", "review", "todo", "backlog", "done"] as const;
  return [
    `# Tasks: ${c.project.name}`,
    ...order.flatMap((status) => {
      const items = c.tasks.filter((t) => t.status === status);
      if (items.length === 0) return [];
      return [
        `## ${status}`,
        items
          .map((t) => `- [${status === "done" ? "x" : " "}] ${t.title} (${t.priority})`)
          .join("\n"),
      ];
    }),
  ].join("\n\n");
}

function memoryFile(c: ProjectContext): string {
  return [
    `# Memory: ${c.project.name}`,
    list(
      c.memory.map(
        (m) =>
          `## ${m.title}\n\n${m.content}\n\n_${m.category} · ${m.importance} · ${m.source} · ${day(m.createdAt)}_`,
      ),
    ),
  ].join("\n\n");
}

function decisionsFile(c: ProjectContext): string {
  return [
    `# Decisions: ${c.project.name}`,
    list(
      c.decisions.map((d) =>
        [
          `## #${String(d.number).padStart(3, "0")} ${d.question}`,
          ...(d.context ? [d.context] : []),
          `- Options: ${d.options.join(", ")}`,
          `- Selected: **${d.selected}**`,
          `- Reason: ${d.reason}`,
          `- Status: ${d.status} · ${day(d.createdAt)}`,
        ].join("\n"),
      ),
    ),
  ].join("\n\n");
}

export function serializeContext(c: ProjectContext): Record<ContextFile, string> {
  return {
    "PROJECT.md": `${projectFile(c)}\n`,
    "PRD.md": c.prd?.content ?? "_No PRD yet._\n",
    "PLAN.md": c.plan.document?.content ?? "_No plan yet._\n",
    "TASKS.md": `${tasksFile(c)}\n`,
    "MEMORY.md": `${memoryFile(c)}\n`,
    "DECISIONS.md": `${decisionsFile(c)}\n`,
  };
}

/** All files in one paste-able bundle, separated by file markers. */
export function bundleContext(files: Record<string, string>): string {
  return Object.entries(files)
    .map(([name, content]) => `<!-- file: ${name} -->\n${content.trimEnd()}\n`)
    .join("\n");
}
