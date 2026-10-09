/**
 * Client-friendly progress (pure). Milestones become stages; a stage is done when all of its
 * tasks are done. Task titles never leave this function, only counts.
 */

export interface StageInput {
  id: string;
  title: string;
  clientTitle: string | null;
  clientVisible: boolean;
}

export interface TaskInput {
  milestoneId: string | null;
  status: string;
}

export type StageState = "done" | "current" | "upcoming";

export interface ClientStage {
  title: string;
  state: StageState;
}

export interface ClientProgress {
  percent: number;
  stages: ClientStage[];
  current: string | null;
  next: string | null;
}

export function clientProgress(milestones: StageInput[], tasks: TaskInput[]): ClientProgress {
  const counted = tasks.filter((t) => t.status !== "backlog");
  const done = counted.filter((t) => t.status === "done").length;
  const percent = counted.length === 0 ? 0 : Math.round((done / counted.length) * 100);

  let currentFound = false;
  const stages: ClientStage[] = [];
  for (const m of milestones) {
    const own = counted.filter((t) => t.milestoneId === m.id);
    const complete = own.length > 0 && own.every((t) => t.status === "done");
    let state: StageState;
    if (complete && !currentFound) state = "done";
    else if (!currentFound) {
      state = "current";
      currentFound = true;
    } else state = "upcoming";
    // Hidden stages still count toward the percentage but are not listed.
    if (m.clientVisible) stages.push({ title: m.clientTitle?.trim() || m.title, state });
  }
  const currentIndex = stages.findIndex((s) => s.state === "current");
  return {
    percent,
    stages,
    current: currentIndex >= 0 ? stages[currentIndex].title : null,
    next: currentIndex >= 0 ? (stages[currentIndex + 1]?.title ?? null) : null,
  };
}
