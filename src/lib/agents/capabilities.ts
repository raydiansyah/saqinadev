import type { AgentCapability, AgentPermission, AgentRole, AgentType } from "@/lib/domain/enums";

/**
 * Capabilities say what an agent is good at; permissions say what it may touch. They are kept
 * apart on purpose: an agent can know Git without being allowed to push.
 */

/** Never granted in Phase 3, whatever is stored on the agent row. */
export const FORBIDDEN_PERMISSIONS: readonly AgentPermission[] = [
  "git_push",
  "deploy",
  "delete_project",
];

export const READ_PERMISSIONS: readonly AgentPermission[] = [
  "read_project",
  "read_prd",
  "read_tasks",
  "read_memory",
];

export function agentCan(agent: { permissions: AgentPermission[] }, permission: AgentPermission) {
  if (FORBIDDEN_PERMISSIONS.includes(permission)) return false;
  return agent.permissions.includes(permission);
}

export interface RoleTemplate {
  role: AgentRole;
  capabilities: AgentCapability[];
  permissions: AgentPermission[];
  priority: number;
}

/** Specialist agents every project gets. They run on the simulated executor in Phase 3. */
export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    role: "planner",
    capabilities: ["planning", "research", "documentation"],
    permissions: [...READ_PERMISSIONS, "write_tasks", "write_documents"],
    priority: 3,
  },
  {
    role: "frontend",
    capabilities: ["frontend", "testing", "code_review", "browser"],
    permissions: [...READ_PERMISSIONS, "write_tasks", "write_memory"],
    priority: 2,
  },
  {
    role: "backend",
    capabilities: ["backend", "database", "security", "testing"],
    permissions: [...READ_PERMISSIONS, "write_tasks", "write_memory"],
    priority: 2,
  },
  {
    role: "qa",
    capabilities: ["testing", "code_review", "browser", "security"],
    permissions: [...READ_PERMISSIONS, "write_tasks", "write_memory"],
    priority: 1,
  },
  {
    role: "docs",
    capabilities: ["documentation", "research"],
    permissions: [...READ_PERMISSIONS, "write_documents", "write_memory"],
    priority: 1,
  },
];

/** What external tool agents could do once connected; they cannot run in Phase 3. */
export const TOOL_CAPABILITIES: Partial<Record<AgentType, AgentCapability[]>> = {
  claude: [
    "planning",
    "frontend",
    "backend",
    "database",
    "testing",
    "documentation",
    "code_review",
    "filesystem",
    "git",
  ],
  codex: ["frontend", "backend", "testing", "code_review", "filesystem", "git"],
  cursor: ["frontend", "backend", "code_review", "filesystem", "git"],
  kiro: ["planning", "frontend", "backend", "testing", "filesystem"],
};

const KEYWORDS: [RegExp, AgentCapability[]][] = [
  [
    /\b(ui|ux|frontend|front-end|halaman|page|screen|layar|komponen|component|form|tampilan|css|react|login page|landing)\b/i,
    ["frontend"],
  ],
  [
    /\b(api|backend|back-end|server|endpoint|webhook|integrasi|integration|payment|pembayaran|refund|auth|authentication|autentikasi|login|session|oauth)\b/i,
    ["backend"],
  ],
  [
    /\b(database|db|schema|skema|migrasi|migration|tabel|table|query|postgres|postgresql|mysql)\b/i,
    ["database"],
  ],
  [/\b(test|testing|qa|uji|pengujian|e2e|regression|checklist)\b/i, ["testing"]],
  [/\b(security|keamanan|permission|izin|rbac|role|akses|access)\b/i, ["security"]],
  [/\b(doc|docs|dokumentasi|documentation|readme|panduan|guide)\b/i, ["documentation"]],
  [/\b(plan|rencana|research|riset|analisa|analysis|requirement|prd|scope)\b/i, ["planning"]],
  [/\b(review|tinjau|audit)\b/i, ["code_review"]],
];

/** Capabilities a task needs, inferred from its words. Falls back to planning. */
export function inferRequiredCapabilities(task: {
  title: string;
  description?: string | null;
  phase?: string | null;
}): AgentCapability[] {
  const text = `${task.title} ${task.description ?? ""} ${task.phase ?? ""}`;
  const found = new Set<AgentCapability>();
  for (const [re, caps] of KEYWORDS) if (re.test(text)) for (const c of caps) found.add(c);
  // "Authentication" alone is backend work; a page or form for it adds frontend.
  if (found.size === 0) found.add("planning");
  return [...found];
}
