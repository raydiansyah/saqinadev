import "server-only";
import * as z from "zod";
import type { Locale } from "@/i18n/locales";
import { runAi } from "@/lib/ai/gateway";
import type { AiProvider } from "@/lib/ai/provider";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { documents, documentVersions } from "@/lib/db/schema";
import { docSlug } from "@/lib/docsync/paths";
import { AppError } from "@/lib/errors";
import { GIT_ADAPTERS } from "@/lib/git/adapters";
import { connectRepository } from "@/lib/git/service";
import { type GitAdapter, GitError } from "@/lib/git/types";
import { withGithubToken } from "@/lib/github/connection";
import { slugify } from "@/lib/interview/rules/profile";
import { STEPS } from "@/lib/interviews/model";
import { updateInterviewProgress, writeAnswers } from "@/lib/interviews/repository";
import { log } from "@/lib/log";
import { startProject } from "@/lib/projects/service";
import { allow } from "@/lib/rate-limit";
import { parse } from "@/lib/validation";
import { adoptRepoDocsTx } from "./adopt";
import { analyzeRules, analyzeWithAi, finalizeAnswers, mergeAnalysis } from "./analyze";
import { parseRepoInput, type RepoDoc, readRepository } from "./repo-reader";

/**
 * Starts a project from an existing GitHub repository: reads its docs and manifests, fills the
 * interview with what they say (always as "imported", never confirmed), copies the documents
 * into the workspace, connects the repository and lands the user on the review step, so nobody
 * answers the interview from scratch. Nothing here writes to the repository.
 */

const importInput = z.object({
  repo: z.string().trim().min(3).max(300),
  /** Only needed for private repositories. Stored encrypted by the repository connection. */
  token: z.string().trim().max(500).optional(),
  /** Use the token of the user's own GitHub connection. The browser never sees it. */
  useConnection: z.boolean().default(false),
  /** Explicit consent to send the repository's documents to the configured AI provider. */
  useAi: z.boolean().default(false),
});

export interface ImportResult {
  slug: string;
  /** What the repository's own PRD, plan and task list became in the project. */
  adopted: { prd: boolean; plan: boolean; tasks: number };
  documents: number;
  /** A language model improved on the rules (false when AI was declined or unavailable). */
  usedAi: boolean;
  connected: boolean;
}

export interface ImportOptions {
  adapter?: GitAdapter;
  aiProvider?: AiProvider;
  connect?: typeof connectRepository;
}

export { docSlug };

const withProvenance = (doc: RepoDoc, repo: string, branch: string) =>
  `> Imported from https://github.com/${repo}/blob/${branch}/${doc.path}${doc.truncated ? " (truncated)" : ""}\n\n${doc.content}`;

type ImportData = z.output<typeof importInput>;

export async function importFromGithub(
  actor: Actor,
  input: unknown,
  locale: Locale,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const data = parse(importInput, input);
  if (!parseRepoInput(data.repo))
    throw new AppError("VALIDATION_ERROR", "owner/name", { repo: "invalid" });
  if (!(await allow(`import:${actor.id}`, 5, 60 * 60 * 1000))) throw new AppError("RATE_LIMIT");
  if (!data.useConnection) return runImport(actor, data, data.token ?? null, locale, options);
  // The connection wins over any pasted token: the secret stays on the server.
  try {
    return await withGithubToken(actor, (token) => runImport(actor, data, token, locale, options));
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND")
      throw new AppError("VALIDATION_ERROR", "GitHub is not connected", {
        repo: "github_not_connected",
      });
    throw error;
  }
}

async function runImport(
  actor: Actor,
  data: ImportData,
  token: string | null,
  locale: Locale,
  options: ImportOptions,
): Promise<ImportResult> {
  const fullName = parseRepoInput(data.repo) as string;

  const adapter = options.adapter ?? GIT_ADAPTERS.github;
  let snapshot: Awaited<ReturnType<typeof readRepository>>;
  try {
    snapshot = await readRepository(adapter, { fullName, baseUrl: null }, token);
  } catch (error) {
    throw new AppError("VALIDATION_ERROR", "Repository could not be read", {
      repo: error instanceof GitError ? error.code : "provider_error",
    });
  }

  const rules = analyzeRules(snapshot);
  let analysis = rules;
  let usedAi = false;
  if (data.useAi && snapshot.docs.length > 0) {
    try {
      const outcome = await runAi({
        operation: "structured_analysis",
        required: ["structured_output"],
        override: options.aiProvider,
        // Without a real model the rules above already are the answer.
        run: async (client) =>
          client.deterministic ? null : analyzeWithAi(snapshot, rules, client),
      });
      if (outcome.value && !outcome.deterministic) {
        analysis = mergeAnalysis(rules, outcome.value);
        usedAi = true;
      }
    } catch (error) {
      log.warn("import.ai_failed", { error: String(error) });
    }
  }
  const final = finalizeAnswers(analysis);

  let adopted: Awaited<ReturnType<typeof adoptRepoDocsTx>> = {
    prd: "none",
    plan: "none",
    tasks: 0,
  };
  const { slug } = await startProject(
    actor,
    { idea: analysis.description, imported: final.answers },
    locale,
    {
      name: final.name,
      ideaSource: "imported",
      afterCreate: async (tx, { projectId, interviewId }) => {
        if (final.details)
          await writeAnswers(tx, interviewId, { details: final.details }, "imported");

        const taken = new Set<string>();
        if (snapshot.docs.length > 0) {
          const rows = await tx
            .insert(documents)
            .values(
              snapshot.docs.map((doc) => ({
                projectId,
                type: "custom" as const,
                title: `${doc.path} (GitHub)`,
                slug: docSlug(doc.path, taken),
                content: withProvenance(doc, snapshot.info.fullName, snapshot.info.defaultBranch),
                createdBy: actor.id,
                updatedBy: actor.id,
              })),
            )
            .returning({ id: documents.id, content: documents.content });
          await tx.insert(documentVersions).values(
            rows.map((d) => ({
              documentId: d.id,
              version: 1,
              content: d.content,
              createdBy: actor.id,
            })),
          );
        }

        // The repository's own PRD, plan and task list become the project's, right away.
        adopted = await adoptRepoDocsTx(tx, projectId);

        // Straight to the review step: earlier steps count as done, the answers stay unconfirmed.
        await updateInterviewProgress(
          tx,
          interviewId,
          "review",
          STEPS.slice(0, STEPS.indexOf("review")),
        );
        await recordAudit(tx, {
          actorId: actor.id,
          scope: "project",
          projectId,
          type: "project.imported",
          entityType: "project",
          entityId: projectId,
          metadata: {
            repository: snapshot.info.fullName,
            documents: snapshot.docs.length,
            ai: usedAi,
          },
        });
      },
    },
  );

  let connected = false;
  try {
    await (options.connect ?? connectRepository)(actor, slug, {
      provider: "github",
      fullName: snapshot.info.fullName,
      token: token ?? undefined,
    });
    connected = true;
  } catch (error) {
    // The project and its documents are already in place; connecting can be retried by hand.
    log.warn("import.connect_failed", { error: String(error) });
  }
  return {
    slug,
    documents: snapshot.docs.length,
    usedAi,
    connected,
    adopted: {
      prd: adopted.prd === "adopted",
      plan: adopted.plan === "adopted",
      tasks: adopted.tasks,
    },
  };
}
