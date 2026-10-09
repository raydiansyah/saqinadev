"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import {
  createChangeRequest,
  sendChangeRequest,
  setChangeRequestStatus,
  teamRecordDecision,
  updateChangeRequest,
} from "@/lib/change-requests/service";
import { sendClientReminder } from "@/lib/reminders/manual";
import { parse } from "@/lib/validation";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function createChangeRequestAction(slug: string, input: unknown) {
  return runAction("cr.create", { slug }, async () => {
    const result = await createChangeRequest(await requireActor(), slug, input);
    refresh();
    return result;
  });
}

export async function updateChangeRequestAction(slug: string, id: string, input: unknown) {
  return runAction("cr.update", { slug, id }, async () => {
    await updateChangeRequest(await requireActor(), slug, id, input);
    refresh();
  });
}

export async function sendChangeRequestAction(slug: string, id: string) {
  return runAction("cr.send", { slug, id }, async () => {
    await sendChangeRequest(await requireActor(), slug, id);
    refresh();
  });
}

export async function recordDecisionAction(slug: string, id: string, input: unknown) {
  return runAction("cr.decide", { slug, id }, async () => {
    await teamRecordDecision(await requireActor(), slug, id, input);
    refresh();
  });
}

export async function setChangeRequestStatusAction(slug: string, id: string, status: unknown) {
  return runAction("cr.status", { slug, id }, async () => {
    const next = parse(z.enum(["cancelled", "done"]), status);
    await setChangeRequestStatus(await requireActor(), slug, id, next);
    refresh();
  });
}

/** Manual client reminder for a sent change request, pending approval or open invoice. */
export async function remindClientAction(slug: string, input: unknown) {
  return runAction("reminder.manual", { slug }, async () =>
    sendClientReminder(await requireActor(), slug, input),
  );
}
