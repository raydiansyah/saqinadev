import { contentScore, DOC_ROLES, NAME } from "@/lib/imports/map-docs";

/**
 * What a repository document is for, from its path and text. Pure and deterministic: the same
 * file always gets the same answer, so a document is only re-classified when it changes.
 * Repositories name their folders differently (docs/, doc/, documentation/, sdlc/, memory/...),
 * so the folder is a hint among others, never a fixed layout.
 */

export const MAP_ROLES = [
  "prd",
  "plan",
  "tasks",
  "spec",
  "memory",
  "decision",
  "process",
  "client",
  "other",
] as const;
export type MapRole = (typeof MAP_ROLES)[number];
export type ClassifiedBy = "name" | "folder" | "content" | "ai" | "user";

export interface Classification {
  role: MapRole;
  by: ClassifiedBy;
  /** 0-100. Name and folder are firm, content is a reading, "other" is a shrug. */
  confidence: number;
}

const FOLDER: [RegExp, MapRole][] = [
  [/^(memory|memories|agent-memory|brain)$/i, "memory"],
  [/^(decisions?|adrs?|architecture-decisions?)$/i, "decision"],
  [/^(sdlc|process(es)?|workflows?|runbooks?|playbooks?|procedures?|guidelines?)$/i, "process"],
  [/^(clients?|customers?|stakeholders?|meetings?)$/i, "client"],
  [/^(specs?|specifications?|design|architecture|rfcs?)$/i, "spec"],
];

const OTHER_NAMES =
  /^(readme|changelog|contributing|license|licence|code[-_]of[-_]conduct|security|support)(\.\w+)?$/i;
const ADR_NAME = /^(adr[-_]?)?\d{2,4}[-_].+\.(md|mdx|markdown|txt)$/i;

const base = (path: string) => path.split("/").pop() ?? path;
const folders = (path: string) => path.split("/").slice(0, -1);
const heading = (text: string) => /^#\s+(.+)$/m.exec(text)?.[1] ?? "";

export function classifyDoc(doc: { path: string; content: string }): Classification {
  const file = base(doc.path);
  const dirs = folders(doc.path);

  // Memory is explicit: anything under a memory folder is memory, whatever it is named.
  if (dirs.some((d) => FOLDER[0][0].test(d)))
    return { role: "memory", by: "folder", confidence: 90 };

  for (const role of DOC_ROLES)
    if (NAME[role].test(file)) return { role, by: "name", confidence: 90 };
  if (OTHER_NAMES.test(file)) return { role: "other", by: "name", confidence: 80 };

  for (const dir of [...dirs].reverse())
    for (const [re, role] of FOLDER)
      if (re.test(dir)) return { role, by: "folder", confidence: 80 };
  if (ADR_NAME.test(file) && /\b(status|decision|context)\b/i.test(doc.content))
    return { role: "decision", by: "name", confidence: 70 };

  const asDoc = { ...doc, truncated: false };
  let best: { role: (typeof DOC_ROLES)[number]; score: number } | null = null;
  for (const role of DOC_ROLES) {
    const score = contentScore(asDoc, role);
    if (score > 0 && (!best || score > best.score)) best = { role, score };
  }
  if (best) return { role: best.role, by: "content", confidence: 60 };

  const title = heading(doc.content);
  if (/\b(adr|decision|keputusan)\b/i.test(title))
    return { role: "decision", by: "content", confidence: 55 };
  if (/\b(meeting|client|stakeholder|klien)\b/i.test(title))
    return { role: "client", by: "content", confidence: 50 };
  if (/\b(process|workflow|procedure|runbook|playbook|proses)\b/i.test(title))
    return { role: "process", by: "content", confidence: 50 };
  if (/\b(architecture|design|specification|spec|arsitektur)\b/i.test(title))
    return { role: "spec", by: "content", confidence: 50 };
  return { role: "other", by: "content", confidence: 30 };
}
