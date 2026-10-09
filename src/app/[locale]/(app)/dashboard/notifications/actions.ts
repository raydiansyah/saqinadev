"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { markRead } from "@/lib/notifications/service";
import { parse } from "@/lib/validation";

/** Marks one notification (or all, without an id) as read; the bell lives in the layout. */
export async function markNotificationReadAction(id?: string) {
  return runAction("notification.dashboard.markRead", { id: id ?? "all" }, async () => {
    const target = id === undefined ? undefined : parse(z.uuid(), id);
    await markRead(await requireActor(), target);
    revalidatePath("/[locale]/dashboard/notifications", "layout");
  });
}
