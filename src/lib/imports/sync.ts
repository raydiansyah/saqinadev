import "server-only";
import * as z from "zod";
import type { Locale } from "@/i18n/locales";
import { recordActivity } from "@/lib/activity/service";
import { explainNoModel, type NoModelExplanation } from "@/lib/ai/diagnostics";
import { AiCallFailed, runAi } from "@/lib/ai/gateway";
import type { AiProvider } from "@/lib/ai/provider";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";
import { parse } from "@/lib/validation";
import { type AdoptResult, adoptRepoDocsTx } from "./adopt";
import { DOC_ROLES, type DocRole, mapDocs } from "./map-docs";
import { addDocRequirementsTx, loadRepoDocs } from "./persist-requirements";
import type { ExtractedRequirement } from "./requirements";
import { extractRequirementsWithAi } from "./requirements-ai";
import { classifyDocsWithAi } from "./roles-ai";

const input = z.object({
  /** Explicit consent to send the repository's documents to the configured AI model. */
  useAi: z.boolean().default(false),
});

export interface SyncResult {
  added: number;
  fromRules: number;
  fromAi: number;
  /** Null when AI was not asked for. */
  ai: "used" | "unavailable" | null;
  /** Why the model did not read the documents, when it was asked to and could not. */
  aiProblem?: NoModelExplanation;
  /** What the repository's PRD, plan and task list became in the project. */
  adopted: AdoptResult;
  /** The project has no repository documents to read. */
  noDocs: boolean;
}

const HOUR = 60 * 60 * 1000;

/**
 * Brings the requirements of an imported project up to date with its repository documents:
 * for projects whose interview was finished before this existed, after the documents changed,
 * or when they are written as prose. Only requirements the project does not have yet are
 * added; nothing is changed or removed. With consent, a model also reads the documents, and
 * only what it can back with a quote from them is kept.
 */
export async function syncRequirementsFromDocs(
  actor: Actor,
  slug: string,
  raw: unknown,
  locale: Locale,
  options: { provider?: AiProvider } = {},
): Promise<SyncResult> {
  const { useAi } = parse(input, raw);
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  if (!(await allow(`req-sync:${actor.id}`, 20, HOUR))) throw new AppError("RATE_LIMIT");

  const docs = await loadRepoDocs(db, access.project.id);
  if (docs.length === 0)
    return {
      added: 0,
      fromRules: 0,
      fromAi: 0,
      ai: null,
      noDocs: true,
      adopted: { prd: "none", plan: "none", tasks: 0 },
    };

  let extra: ExtractedRequirement[] = [];
  let hints: Partial<Record<DocRole, string>> = {};
  let ai: SyncResult["ai"] = null;
  let aiProblem: NoModelExplanation | undefined;
  if (useAi) {
    if (!(await allow(`ai-req:${actor.id}`, 5, HOUR))) throw new AppError("RATE_LIMIT");
    const language = locale === "id" ? "Indonesian" : "English";
    try {
      const outcome = await runAi({
        access,
        operation: "structured_analysis",
        required: ["structured_output"],
        override: options.provider,
        // Without a real model nothing is guessed: the rules above are the whole answer.
        run: async (client) => {
          if (client.deterministic) return null;
          const items = await extractRequirementsWithAi(docs, client, language);
          // Documents the file names do not give away: the model says which is PRD, plan, tasks.
          const repoDocs = docs.map((d) => ({ ...d, truncated: false }));
          const byName = mapDocs(repoDocs);
          // Telling the documents apart is a bonus: failing at it never loses the requirements.
          const roles = DOC_ROLES.some((r) => !byName[r])
            ? await classifyDocsWithAi(repoDocs, client).catch(() => ({}))
            : {};
          return { items, roles };
        },
      });
      if (outcome.value && !outcome.deterministic) {
        extra = outcome.value.items;
        hints = outcome.value.roles;
        ai = "used";
      } else {
        ai = "unavailable";
        aiProblem = explainNoModel(outcome.diagnostics);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      ai = "unavailable";
      aiProblem =
        error instanceof AiCallFailed
          ? explainNoModel(error.diagnostics)
          : { reason: "provider_failed" };
    }
  }

  const result = await db.transaction(async (tx) => {
    const writer = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const added = await addDocRequirementsTx(tx, {
      projectId: writer.project.id,
      actorId: actor.id,
      docs,
      extra,
    });
    if (added.added > 0)
      await recordActivity(tx, {
        projectId: writer.project.id,
        actorId: actor.id,
        type: "requirement.created",
        entityType: "requirement",
        metadata: { title: `${added.added} from repository documents`, count: added.added },
      });
    // The repository's own PRD, plan and task list, where the project does not have its own yet.
    const adopted = await adoptRepoDocsTx(tx, writer.project.id, hints);
    return { ...added, adopted };
  });
  return { ...result, ai, aiProblem, noDocs: false };
}
