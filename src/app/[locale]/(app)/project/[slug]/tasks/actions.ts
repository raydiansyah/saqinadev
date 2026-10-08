"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { createTask, updateTask } from "@/lib/tasks/service";

// Refresh the whole project layout so the header's next action follows task changes.
const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function createTaskAction(slug: string, input: unknown) {
  return runAction("task.create", { slug }, async () => {
    const row = await createTask(await requireActor(), slug, input);
    refresh();
    return { id: row.id };
  });
}

/** Edits, moves, completes and reopens; the service keeps completedAt in sync with status. */
export async function updateTaskAction(slug: string, input: unknown) {
  return runAction("task.update", { slug }, async () => {
    const row = await updateTask(await requireActor(), slug, input);
    refresh();
    return { id: row.id, status: row.status };
  });
}
