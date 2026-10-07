/**
 * The scroll story's structure, declared in one place. Ranges split the story's scroll
 * progress (0 to 1) between chapters; visuals react to the active chapter and its local
 * progress. Chapter copy lives in the per-language site content (`content/site`).
 */

export const STORY_CHAPTERS = [
  "idea",
  "project",
  "paths",
  "agents",
  "documents",
  "memory",
  "mcp",
  "approval",
  "deploy",
] as const;
export type ChapterId = (typeof STORY_CHAPTERS)[number];

/** Forms the persistent project node takes through the story (ids; labels are translated). */
export const NODE_FORMS = [
  "Idea",
  "Project",
  "Context",
  "PRD",
  "Memory",
  "Task",
  "Deploy",
] as const;
export type NodeForm = (typeof NODE_FORMS)[number];

/** Stops on the system map rail shown beside the stage (ids; labels are translated). */
export const RAIL_STOPS = [
  "Idea",
  "Project",
  "Saqina / Agent",
  "PRD",
  "Plan",
  "Tasks",
  "Git",
  "CI/CD",
  "Deploy",
] as const;
export type RailStop = (typeof RAIL_STOPS)[number];

export interface Chapter {
  id: ChapterId;
  range: readonly [number, number];
  index: string;
  node: NodeForm;
  rail: RailStop;
  /** Optional rail stop per step, for chapters that walk through several stops. */
  railSteps?: readonly RailStop[];
  /** Number of discrete visual steps inside the chapter (drives data-step). */
  steps: number;
}

export const STORY: readonly Chapter[] = [
  { id: "idea", range: [0, 0.11], index: "01", node: "Idea", rail: "Idea", steps: 2 },
  { id: "project", range: [0.11, 0.23], index: "02", node: "Project", rail: "Project", steps: 3 },
  {
    id: "paths",
    range: [0.23, 0.36],
    index: "03",
    node: "Project",
    rail: "Saqina / Agent",
    steps: 3,
  },
  {
    id: "agents",
    range: [0.36, 0.47],
    index: "04",
    node: "Context",
    rail: "Saqina / Agent",
    steps: 1,
  },
  { id: "documents", range: [0.47, 0.59], index: "05", node: "PRD", rail: "PRD", steps: 4 },
  { id: "memory", range: [0.59, 0.68], index: "06", node: "Memory", rail: "Plan", steps: 3 },
  { id: "mcp", range: [0.68, 0.79], index: "07", node: "Task", rail: "Tasks", steps: 4 },
  { id: "approval", range: [0.79, 0.88], index: "08", node: "Task", rail: "Tasks", steps: 1 },
  {
    id: "deploy",
    range: [0.88, 1],
    index: "09",
    node: "Deploy",
    rail: "Deploy",
    railSteps: ["Git", "CI/CD", "CI/CD", "Deploy", "Deploy"],
    steps: 5,
  },
];

/** Which chapter owns a given story progress value. */
export function chapterAt(progress: number): Chapter {
  const p = Math.min(Math.max(progress, 0), 1);
  return STORY.find((c) => p >= c.range[0] && p < c.range[1]) ?? STORY[STORY.length - 1];
}

/** Progress inside a chapter, 0 to 1. */
export function localProgress(chapter: Chapter, progress: number): number {
  const [start, end] = chapter.range;
  return Math.min(Math.max((progress - start) / (end - start), 0), 1);
}

/** Discrete visual step for a local progress value: 0 .. steps - 1. */
export function stepAt(chapter: Chapter, local: number): number {
  return Math.min(Math.floor(local * chapter.steps), chapter.steps - 1);
}
