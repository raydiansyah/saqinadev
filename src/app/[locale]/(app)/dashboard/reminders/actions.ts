"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { runRemindersForActor, setRuleEnabled } from "@/lib/reminders/service";

const refresh = () => revalidatePath("/[locale]/dashboard/reminders", "page");

export async function setReminderRuleAction(id: string, enabled: boolean) {
  return runAction("reminder.rule.toggle", { id, enabled }, async () => {
    await setRuleEnabled(await requireActor(), { id, enabled });
    refresh();
  });
}

export async function runRemindersAction() {
  return runAction("reminder.run", {}, async () => {
    const result = await runRemindersForActor(await requireActor());
    // The actor may be a recipient; refresh the bell too.
    revalidatePath("/[locale]/dashboard", "layout");
    return result;
  });
}
