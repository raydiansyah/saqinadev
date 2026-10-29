"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { isLocale } from "@/i18n/locales";
import { runAction } from "@/lib/actions";
import { cancelRun, pauseRun, reassignRun, resumeRun, retryRun } from "@/lib/agents/controls";
import { agentOptions } from "@/lib/agents/options";
import { chatContextOptions } from "@/lib/assistant/chat-context";
import { requireActor, requireProjectAccess } from "@/lib/auth/server";
import {
  forkConversation,
  pinChapter,
  previewRewind,
  rewindConversation,
  setAgentAccess,
  unpinChapter,
} from "@/lib/conversations/chat-tools";
import { listConversations, loadMessages } from "@/lib/conversations/service";
import { scheduleDocSync } from "@/lib/docsync/schedule";
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
    // An approved proposal may have changed a document: push it out when sync is on.
    scheduleDocSync({ slug });
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

export async function pinChapterAction(slug: string, input: unknown) {
  return runAction("conversation.pin", { slug }, async () =>
    pinChapter(await requireActor(), slug, input),
  );
}

export async function unpinChapterAction(slug: string, input: unknown) {
  return runAction("conversation.unpin", { slug }, async () =>
    unpinChapter(await requireActor(), slug, input),
  );
}

export async function forkConversationAction(slug: string, input: unknown) {
  return runAction("conversation.fork", { slug }, async () =>
    forkConversation(await requireActor(), slug, input),
  );
}

/** Shows what a rewind would do, including anything that stops it. Changes nothing. */
export async function previewRewindAction(slug: string, input: unknown) {
  return runAction("conversation.rewind_preview", { slug }, async () =>
    previewRewind(await requireActor(), slug, input),
  );
}

export async function rewindAction(slug: string, input: unknown) {
  return runAction("conversation.rewind", { slug }, async () => {
    const result = await rewindConversation(await requireActor(), slug, input);
    if (result.applied) {
      refresh();
      // A rewind can put an older version of a document back: push it out when sync is on.
      scheduleDocSync({ slug });
    }
    return result;
  });
}

export async function setAgentAccessAction(slug: string, input: unknown) {
  return runAction("conversation.agent_access", { slug }, async () =>
    setAgentAccess(await requireActor(), slug, input),
  );
}

/** Skills and connectors the composer offers as context, plus where to manage connectors. */
export async function chatContextOptionsAction(slug: string) {
  return runAction("assistant.contextOptions", { slug }, async () =>
    chatContextOptions(await requireProjectAccess(slug)),
  );
}
