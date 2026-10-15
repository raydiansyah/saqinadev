"use server";

import { isLocale } from "@/i18n/locales";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { importFromGithub } from "@/lib/imports/service";
import { startProject } from "@/lib/projects/service";

// Locale comes from the client: next/root-params is not available inside Server Actions.
export async function startProjectAction(input: {
  idea: string;
  locale: string;
  imported?: unknown;
}) {
  return runAction("project.start", {}, async () => {
    const actor = await requireActor();
    const { locale, ...rest } = input;
    return startProject(actor, rest, isLocale(locale) ? locale : "en");
  });
}

/** Starts a project from an existing GitHub repository (docs and stack become interview answers). */
export async function importProjectAction(input: {
  repo: string;
  token?: string;
  useConnection?: boolean;
  useAi: boolean;
  locale: string;
}) {
  return runAction("project.import_github", { repo: input.repo }, async () => {
    const actor = await requireActor();
    const { locale, ...rest } = input;
    return importFromGithub(actor, rest, isLocale(locale) ? locale : "en");
  });
}
