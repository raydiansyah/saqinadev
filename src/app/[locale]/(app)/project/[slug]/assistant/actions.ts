"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { isLocale } from "@/i18n/locales";
import { runAction } from "@/lib/actions";
import { cancelRun, pauseRun, reassignRun, resumeRun, retryRun } from "@/lib/agents/controls";
import { agentOptions } from "@/lib/agents/options";
import { requireActor, requireProjectAccess } from "@/lib/auth/server";
import { listConversations, loadMessages } from "@/lib/conversations/service";
import { AppError } from "@/lib/errors";
import { approveProposal, rejectProposal, requestRevision } from "@/lib/proposals/service";
import { parse } from "@/lib/validation";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");
const localeOf = (value: string) => {
  if (!isLocale(value)) throw new AppError("VALIDATION_ERROR");
  return value;
};

export async function loadConversationAction(slug: string, input: unknown) {
  return runAction("conversation.load", { slug }, async () => {
    const { conversationId, before } = parse(
      z.object({
        conversationId: z.uuid(),
        before: z.object({ createdAt: z.coerce.date(), id: z.uuid() }).optional(),
      }),
      input,
    );
    const access = await requireProjectAccess(slug);
    const page = await loadMessages(access, conversationId, before);
    // Agent choices only when a proposal on the page lets the reviewer pick one.
    const needsAgents = page.proposals.some((p) =>
      p.actions.some((a) => a.type === "ASSIGN_AGENT"),
    );
    const agents = needsAgents ? await agentOptions(access) : [];
    return { ...page, agents };
  });
}

export async function listConversationsAction(slug: string) {
  return runAction("conversation.list", { slug }, async () =>
    listConversations(await requireProjectAccess(slug)),
  );
}

export async function approveProposalAction(slug: string, input: unknown) {
  return runAction("proposal.approve", { slug }, async () => {
    const result = await approveProposal(await requireActor(), slug, input);
    refresh();
    return result;
  });
}

export async function rejectProposalAction(slug: string, input: unknown, locale: string) {
  return runAction("proposal.reject", { slug }, async () => {
    await rejectProposal(await requireActor(), slug, input, localeOf(locale));
    refresh();
    return null;
  });
}

export async function requestRevisionAction(slug: string, input: unknown, locale: string) {
  return runAction("proposal.revise", { slug }, async () => {
    await requestRevision(await requireActor(), slug, input, localeOf(locale));
    refresh();
    return null;
  });
}

const RUN_CONTROLS = { cancel: cancelRun, retry: retryRun, pause: pauseRun, resume: resumeRun };

export async function runControlAction(
  slug: string,
  control: keyof typeof RUN_CONTROLS,
  input: unknown,
) {
  return runAction(`run.${control}`, { slug }, async () => {
    // The control name comes from the client: accept only the four known ones.
    if (!Object.hasOwn(RUN_CONTROLS, control)) throw new AppError("VALIDATION_ERROR");
    await RUN_CONTROLS[control](await requireActor(), slug, input);
    refresh();
    return null;
  });
}

export async function reassignRunAction(slug: string, input: unknown) {
  return runAction("run.reassign", { slug }, async () => {
    const result = await reassignRun(await requireActor(), slug, input);
    refresh();
    return result;
  });
}
