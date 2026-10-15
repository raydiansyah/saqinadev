"use server";

import { isLocale } from "@/i18n/locales";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { reviewInterviewWithAi } from "@/lib/interviews/ai-review";
import { completeInterview, saveAnswers } from "@/lib/interviews/service";
import type { SaveAnswersInput } from "@/lib/interviews/validators";

export async function saveAnswersAction(input: SaveAnswersInput) {
  return runAction("interview.save", { slug: input.slug, step: input.step }, async () => {
    const actor = await requireActor();
    const { savedAt } = await saveAnswers(actor, input);
    return { savedAt: savedAt.toISOString() };
  });
}

export async function completeInterviewAction(slug: string) {
  return runAction("interview.complete", { slug }, async () => {
    const actor = await requireActor();
    // No revalidation here: re-rendering the interview route would replace the client-side
    // "project ready" screen. Its links load the workspace fresh (dynamic routes).
    return completeInterview(actor, slug);
  });
}

/** Asks the platform's configured AI model to review the answers. It only advises. */
export async function aiReviewAction(slug: string, locale: string) {
  return runAction("interview.ai_review", { slug }, async () => {
    const actor = await requireActor();
    return reviewInterviewWithAi(actor, slug, isLocale(locale) ? locale : "en");
  });
}
