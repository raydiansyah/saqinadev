import type {
  AnswerSource,
  BuildStrategy,
  Confidence,
  DecisionStatus,
  DocumentStatus,
  MemoryCategory,
  MemorySource,
  Priority,
  ProjectStatus,
  RecommendationKey,
  RecommendationSource,
  RequirementGroup,
  RequirementStatus,
  TaskStatus,
} from "@/lib/domain/enums";

interface DocumentSnapshot {
  content: string;
  version: number;
  status: DocumentStatus;
}

/** Everything an agent needs to work on a project without asking "what are we building?". */
export interface ProjectContext {
  project: {
    name: string;
    slug: string;
    description: string;
    type: string | null;
    status: ProjectStatus;
    complexity: string | null;
    platform: string | null;
    buildStrategy: BuildStrategy | null;
    preferredAgent: string | null;
    locale: string;
    updatedAt: Date;
  };
  requirements: {
    group: RequirementGroup;
    title: string;
    description: string;
    priority: Priority;
    status: RequirementStatus;
    source: AnswerSource;
  }[];
  recommendations: {
    key: RecommendationKey;
    value: string;
    reason: string;
    confidence: Confidence;
    source: RecommendationSource;
  }[];
  prd: DocumentSnapshot | null;
  plan: {
    document: DocumentSnapshot | null;
    milestones: {
      title: string;
      goal: string;
      tasks: { title: string; status: TaskStatus; priority: Priority }[];
    }[];
  };
  tasks: { title: string; status: TaskStatus; priority: Priority; description: string }[];
  memory: {
    title: string;
    content: string;
    category: MemoryCategory;
    importance: "high" | "normal";
    source: MemorySource;
    createdAt: Date;
  }[];
  decisions: {
    number: number;
    question: string;
    context: string;
    options: string[];
    selected: string;
    reason: string;
    status: DecisionStatus;
    createdAt: Date;
  }[];
  documents: { title: string; slug: string; content: string }[];
}

export const CONTEXT_FILES = [
  "PROJECT.md",
  "PRD.md",
  "PLAN.md",
  "TASKS.md",
  "MEMORY.md",
  "DECISIONS.md",
] as const;
export type ContextFile = (typeof CONTEXT_FILES)[number];
