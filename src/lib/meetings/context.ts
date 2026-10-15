import "server-only";
import type { PromptSegment } from "@/lib/ai/provider";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { listDecisions } from "@/lib/decisions/service";
import { listRequirements } from "@/lib/requirements/service";
import { listScope } from "@/lib/scope/service";
import { listTasks } from "@/lib/tasks/service";
import type { KnownEntities } from "./verify";

/** Total characters of project context sent along with a note. */
const BUDGET = 12_000;

export interface NoteContext {
  known: KnownEntities;
  segments: PromptSegment[];
}

/**
 * The project records a note is compared with. Each line starts with the record's id so the
 * model can point at it; the verifier later accepts only ids that appear here.
 */
export async function loadNoteContext(access: ProjectAccess): Promise<NoteContext> {
  const [requirements, tasks, scope, decisions] = await Promise.all([
    listRequirements(access),
    listTasks(access),
    listScope(access.project.id),
    listDecisions(access),
  ]);
  const known: KnownEntities = {
    requirements: requirements.map((r) => ({ id: r.id, title: r.title })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title })),
    decisions: decisions.map((d) => ({ id: d.id, title: d.question })),
    scope: scope.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      category: s.category,
    })),
  };

  let room = BUDGET;
  const take = (label: string, lines: string[]): PromptSegment[] => {
    const kept: string[] = [];
    for (const line of lines) {
      if (room - line.length < 0) break;
      room -= line.length + 1;
      kept.push(line);
    }
    return kept.length ? [{ kind: "project_data", label, content: kept.join("\n") }] : [];
  };
  // Scope first: it decides what is in or out. Then what is already planned.
  const segments = [
    ...take(
      "agreed scope (id, category, title)",
      scope.map((s) => `${s.id} [${s.category}] ${s.title}`),
    ),
    ...take(
      "requirements (id, status, title)",
      requirements.map((r) => `${r.id} [${r.status}] ${r.title}`),
    ),
    ...take(
      "tasks (id, status, title)",
      tasks.map((t) => `${t.id} [${t.status}] ${t.title}`),
    ),
    ...take(
      "decisions (id, question)",
      decisions.map((d) => `${d.id} ${d.question}`),
    ),
  ];
  return { known, segments };
}
