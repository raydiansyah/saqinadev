import type { Priority, RunStatus, TaskSource, TaskStatus } from "@/lib/domain/enums";

/** The open agent run on a task, if any. */
export interface TaskRun {
  runId: string;
  status: RunStatus;
  agentName: string;
}

/** The slice of a task the board needs; keeps server-only fields out of client props. */
export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  source: TaskSource;
  milestoneId: string | null;
}

export interface MilestoneOption {
  id: string;
  title: string;
}

/** Form state for the create/edit dialog. No id means create. */
export interface TaskDraft {
  id?: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  milestoneId: string | null;
}
