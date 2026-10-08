import {
  AGENT_TYPES,
  type AgentStatus,
  type AgentType,
  type MemoryCategory,
  type MemorySource,
  type Priority,
  type TaskStatus,
} from "@/lib/domain/enums";
import type { EngineCopy } from "@/lib/interview/copy/types";
import type { FeatureId } from "@/lib/interview/options";
import { suggestFeatures } from "@/lib/interview/rules/recommend";
import type { Analysis, RequirementDraft } from "@/lib/interviews/analyzer";
import type { ProjectCopy } from "@/lib/interviews/copy/types";
import type { InterviewData } from "@/lib/interviews/model";
import type { ProjectRecommendation, RecommendationItem } from "@/lib/recommendations/engine";
import type { GeneratorCopy } from "./copy/types";

/**
 * Everything created alongside a new project, derived only from the interview, its analysis
 * and the accepted recommendations. Pure so it can be tested without a database.
 */
export interface GeneratedProject {
  name: string;
  description: string;
  requirements: RequirementDraft[];
  prd: string;
  plan: string;
  milestones: { title: string; goal: string; tasks: GeneratedTask[] }[];
  memories: {
    title: string;
    content: string;
    category: MemoryCategory;
    importance: "high" | "normal";
    source: MemorySource;
  }[];
  decisions: {
    question: string;
    context: string;
    options: string[];
    selected: string;
    reason: string;
  }[];
  agents: { type: AgentType; name: string; provider: string; status: AgentStatus }[];
}

export interface GeneratedTask {
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  phase: string;
}

interface Inputs {
  data: InterviewData;
  analysis: Analysis;
  recommendation: ProjectRecommendation;
  engine: EngineCopy;
  copy: ProjectCopy;
  gen: GeneratorCopy;
}

const bullets = (items: string[], empty: string) =>
  items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : `- ${empty}`;

const item = (rec: ProjectRecommendation, key: RecommendationItem["key"]) =>
  rec.items.find((i) => i.key === key);

/** Feature labels ordered by priority so plans and PRDs lead with what matters most. */
function orderedFeatures(analysis: Analysis): RequirementDraft[] {
  const rank: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return analysis.requirements
    .filter((r) => r.key.startsWith("feature:"))
    .sort((a, b) => rank[a.priority] - rank[b.priority]);
}

function mark(r: RequirementDraft, gen: GeneratorCopy) {
  return r.status === "inferred" ? ` ${gen.inferredMark}` : "";
}

function buildPrd({ data, analysis, recommendation, engine, copy, gen }: Inputs): string {
  const { answers, details } = data;
  const t = gen.prd;
  const h = t.headings;
  const reqs = analysis.requirements;
  const byGroup = (...groups: RequirementDraft["group"][]) =>
    reqs.filter((r) => groups.includes(r.group));
  const features = orderedFeatures(analysis);
  const audience = answers.audience.map((a) => engine.options.audience[a].label);
  const who = audience[0] ?? gen.toBeDefined;
  const typeLabel = answers.projectType
    ? engine.options.projectType[answers.projectType].label
    : gen.toBeDefined;
  // Typical features for this type that the user did not pick are out of scope for now.
  const nonGoals = answers.featuresUnknown
    ? []
    : suggestFeatures(answers).map((f) => engine.options.feature[f].label);
  const landing = item(recommendation, "landing");

  const section = (n: number, title: string, body: string) => `## ${n}. ${title}\n\n${body}`;
  const sections = [
    section(
      1,
      h[0],
      [
        `**${analysis.name}**`,
        answers.projectDescription.trim() || gen.toBeDefined,
        `${t.type}: ${typeLabel}`,
        `${t.complexity}: ${engine.complexity.names[analysis.complexity.level]}. ${analysis.complexity.reason}`,
      ].join("\n\n"),
    ),
    section(
      2,
      h[1],
      answers.objective.trim() ? t.problem(answers.objective.trim()) : t.noObjective,
    ),
    section(
      3,
      h[2],
      bullets(
        [
          ...(answers.objective.trim() ? [answers.objective.trim()] : []),
          ...features.slice(0, 5).map((f) => t.goalFeature(f.title)),
        ],
        gen.toBeDefined,
      ),
    ),
    section(4, h[3], `${t.nonGoalsIntro}\n\n${bullets(nonGoals, t.nonGoalsDefault)}`),
    section(5, h[4], bullets(audience, gen.toBeDefined)),
    section(
      6,
      h[5],
      bullets(
        byGroup("users_roles")
          .filter((r) => r.key.startsWith("role:"))
          .map((r) => `${r.title.replace(/^[^:]+:\s*/, "")}${mark(r, gen)}`),
        gen.toBeDefined,
      ),
    ),
    section(
      7,
      h[6],
      bullets(
        features.map(
          (f) => `**${f.title}** (${gen.priorities[f.priority]}): ${f.description}${mark(f, gen)}`,
        ),
        gen.toBeDefined,
      ),
    ),
    section(
      8,
      h[7],
      [
        bullets(
          [
            ...(answers.features.includes("auth") ? [t.flowSignIn(who)] : []),
            ...features
              .filter((f) => f.key !== "feature:auth" && f.key !== "feature:rbac")
              .slice(0, 4)
              .map((f) => t.flowCore(who, f.title.toLowerCase())),
            ...(answers.features.includes("rbac") ||
            analysis.assumptions.some((a) => a.key === "rbac")
              ? [t.flowAdmin]
              : []),
          ],
          gen.toBeDefined,
        ),
        `_${t.flowNote}_`,
      ].join("\n\n"),
    ),
    section(
      9,
      h[8],
      bullets(
        byGroup("features", "authentication", "business_rules").map(
          (r, i) => `FR-${String(i + 1).padStart(2, "0")} ${r.description}${mark(r, gen)}`,
        ),
        gen.toBeDefined,
      ),
    ),
    section(
      10,
      h[9],
      bullets(
        [
          ...t.nonFunctional,
          ...(details.platforms.length > 0
            ? [t.platform(engine.joinList(details.platforms.map((p) => copy.platforms[p])))]
            : []),
        ],
        gen.toBeDefined,
      ),
    ),
    section(
      11,
      h[10],
      bullets(
        byGroup("integrations").map((r) => `${r.title}: ${r.description}`),
        gen.none,
      ),
    ),
    section(
      12,
      h[11],
      bullets(
        byGroup("data").map((r) => r.description),
        gen.toBeDefined,
      ),
    ),
    section(
      13,
      h[12],
      bullets(
        answers.features.includes("auth")
          ? [
              t.securityAuth,
              ...(answers.features.includes("rbac") ? [t.securityRoles] : []),
              t.securityData,
            ]
          : [t.securityNoAuth, t.securityData],
        gen.toBeDefined,
      ),
    ),
    section(
      14,
      h[13],
      bullets(
        [
          ...byGroup("ux").map((r) => `${r.description}${mark(r, gen)}`),
          ...(landing
            ? [t.landing(`${landing.value}${landing.detail ? ` ${landing.detail}` : ""}`)]
            : []),
        ],
        gen.toBeDefined,
      ),
    ),
    section(
      15,
      h[14],
      bullets(
        recommendation.items
          .filter((i) => i.key !== "landing")
          .map((i) => `**${i.label}:** ${i.value}. ${i.reason}`),
        gen.toBeDefined,
      ),
    ),
    section(16, h[15], bullets(analysis.risks, gen.none)),
    section(
      17,
      h[16],
      bullets(
        [
          ...analysis.openQuestions.map((q) => `${q.title}. ${q.message}`),
          ...analysis.conflicts.map((c) => `${c.title}. ${c.message}`),
        ],
        gen.none,
      ),
    ),
    section(
      18,
      h[17],
      bullets(
        features.slice(0, 8).map((f) => t.acceptance(f.title)),
        gen.toBeDefined,
      ),
    ),
  ];

  return [`# ${t.title}: ${analysis.name}`, `> ${t.draftNote}`, ...sections].join("\n\n") + "\n";
}

function buildMilestones({
  data,
  analysis,
  recommendation,
  gen,
}: Inputs): GeneratedProject["milestones"] {
  const t = gen.plan;
  const { answers } = data;
  const features = orderedFeatures(analysis).filter(
    (f) => f.key !== "feature:auth" && f.key !== "feature:rbac",
  );
  const needsDb =
    (item(recommendation, "database")?.value ?? "") !== "" && answers.databaseNeed !== "no";
  const hasAuth =
    answers.features.includes("auth") ||
    analysis.requirements.some((r) => r.key === "auth:methods");
  const hasRoles = analysis.requirements.some((r) => r.key === "feature:rbac");
  const deploy = item(recommendation, "deployment")?.value ?? "";
  const landing = item(recommendation, "landing");
  const task = (
    title: string,
    priority: Priority,
    status: TaskStatus,
    phase: string,
    description = "",
  ): GeneratedTask => ({
    title,
    description,
    priority,
    status,
    phase,
  });

  const foundation = [
    task(t.tasks.setup, "high", "todo", "foundation"),
    ...(needsDb ? [task(t.tasks.database, "high", "todo", "foundation")] : []),
    ...(hasAuth ? [task(t.tasks.auth, "critical", "todo", "foundation")] : []),
    task(t.tasks.shell, "medium", "todo", "foundation"),
  ];
  const core = [
    ...(hasRoles ? [task(t.tasks.roles, "high", "backlog", "core")] : []),
    ...features.map((f) =>
      task(t.tasks.feature(f.title), f.priority, "backlog", "core", f.description),
    ),
  ];
  const launch = [
    ...(analysis.openQuestions.length > 0
      ? [task(t.tasks.openQuestions, "high", "todo", "foundation")]
      : []),
    task(t.tasks.tests, "high", "backlog", "launch"),
    ...(landing ? [task(t.tasks.landing(landing.value), "medium", "backlog", "launch")] : []),
    ...(deploy ? [task(t.tasks.deploy(deploy), "medium", "backlog", "launch")] : []),
  ];

  return [
    { ...t.milestones.foundation, tasks: foundation },
    { ...t.milestones.core, tasks: core },
    { ...t.milestones.launch, tasks: launch },
  ];
}

function buildPlan(
  name: string,
  milestones: GeneratedProject["milestones"],
  gen: GeneratorCopy,
): string {
  const parts = [`# ${gen.plan.title}: ${name}`, gen.plan.intro];
  milestones.forEach((m, i) => {
    parts.push(
      `## Milestone ${String(i + 1).padStart(2, "0")}: ${m.title}`,
      m.goal,
      m.tasks.map((t) => `- [ ] ${t.title}`).join("\n"),
    );
  });
  return parts.join("\n\n") + "\n";
}

function buildMemories({ data, recommendation, gen }: Inputs): GeneratedProject["memories"] {
  const t = gen.memory;
  const memories: GeneratedProject["memories"] = [];
  const fromRec = (
    key: RecommendationItem["key"],
    title: (v: string) => string,
    category: MemoryCategory,
    importance: "high" | "normal" = "normal",
  ) => {
    const rec = item(recommendation, key);
    if (!rec) return;
    memories.push({
      title: title(`${rec.value}${rec.detail ? ` ${rec.detail}` : ""}`),
      content: t.reason(rec.reason),
      category,
      importance,
      source: rec.source === "user" ? "user" : "recommendation",
    });
  };

  if (data.answers.objective.trim()) {
    memories.push({
      title: t.goal,
      content: data.answers.objective.trim(),
      category: "product",
      importance: "high",
      source: "interview",
    });
  }
  fromRec("architecture", t.architecture, "architecture", "high");
  fromRec("database", t.database, "technical", "high");
  fromRec("authentication", t.auth, "technical");
  fromRec("deployment", t.deployment, "integration");
  fromRec("build_strategy", t.build, "user_preference");
  fromRec("landing", t.landing, "design");
  if (data.details.constraints.trim()) {
    memories.push({
      title: t.constraints,
      content: data.details.constraints.trim(),
      category: "constraint",
      importance: "high",
      source: "interview",
    });
  }
  return memories;
}

function buildDecisions({ recommendation, gen }: Inputs): GeneratedProject["decisions"] {
  const t = gen.decisions;
  const out: GeneratedProject["decisions"] = [];
  const decide = (key: RecommendationItem["key"], question: string, fallback: string[] = []) => {
    const rec = item(recommendation, key);
    if (!rec) return;
    const options = [rec.value, ...(rec.alternatives.length > 0 ? rec.alternatives : fallback)]
      .filter((v, i, all) => all.indexOf(v) === i)
      .slice(0, 3);
    out.push({ question, context: t.context, options, selected: rec.value, reason: rec.reason });
  };
  decide("application", t.application);
  decide("database", t.database);
  decide("authentication", t.auth);
  decide("build_strategy", t.build);
  return out;
}

/** The agent the user plans to build with: an override wins, then the interview answer. */
export function preferredAgent(
  data: InterviewData,
  recommendation: ProjectRecommendation,
  gen: GeneratorCopy,
): AgentType {
  const override = data.overrides.build_strategy?.toLowerCase();
  if (override) {
    const named = AGENT_TYPES.find(
      (type) => type !== "custom" && override.includes(gen.agents[type].name.toLowerCase()),
    );
    if (named) return named;
  }
  if (recommendation.base.development.value !== "external") return "saqina";
  const answer = data.answers.agent;
  return answer && answer !== "unsure" && answer !== "other" ? answer : "claude";
}

function buildAgents({ data, recommendation, gen }: Inputs): GeneratedProject["agents"] {
  const preferred = preferredAgent(data, recommendation, gen);
  return AGENT_TYPES.map((type) => ({
    type,
    ...gen.agents[type],
    status: type === preferred ? "pending" : "available",
  }));
}

export function generateProject(inputs: Inputs): GeneratedProject {
  const { analysis, data } = inputs;
  const milestones = buildMilestones(inputs);
  return {
    name: analysis.name,
    description: data.answers.objective.trim() || data.answers.projectDescription.trim(),
    requirements: analysis.requirements,
    prd: buildPrd(inputs),
    plan: buildPlan(analysis.name, milestones, inputs.gen),
    milestones,
    memories: buildMemories(inputs),
    decisions: buildDecisions(inputs),
    agents: buildAgents(inputs),
  };
}

/** Features in the plan, exported for tests and the project overview. */
export const plannedFeatures = (analysis: Analysis): FeatureId[] =>
  orderedFeatures(analysis).map((r) => r.key.slice("feature:".length) as FeatureId);
