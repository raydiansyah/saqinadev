import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import type { Locale } from "@/i18n/locales";
import { isLocale } from "@/i18n/locales";
import { runAi } from "@/lib/ai/gateway";
import type { AiProvider } from "@/lib/ai/provider";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { documents, requirements } from "@/lib/db/schema";
import { saveDocumentTx } from "@/lib/documents/service";
import { AppError } from "@/lib/errors";
import { insertPrdTx } from "@/lib/imports/choose-prd";
import { createProjectIntelligence } from "@/lib/interviews/intelligence";
import { findLatestInterview, readInterviewData } from "@/lib/interviews/repository";
import { getGeneratorCopy } from "@/lib/projects/copy";
import { allow } from "@/lib/rate-limit";
import { skillSegments } from "@/lib/skills/prompt";
import { platformSkillsFor } from "@/lib/skills/service";
import { parse } from "@/lib/validation";
import {
  enhanceDeterministic,
  MAX_SECTION_CHARS,
  type PrdBrief,
  prdBriefInput,
  renderPrd,
  splitPrd,
} from "./brief";

/**
 * Generate PRD: a form with one field per section, filled from what the project already knows,
 * each field improved on request (Enhance), then saved as the PRD. Saving is the person's own
 * edit, so a new version clears signatures and asks for approval again, like any other edit.
 */

export interface PrdBriefView {
  brief: PrdBrief;
  /** Where the form was filled from. */
  source: "prd" | "interview" | "empty";
  /** The current PRD version the save must build on; null when there is none yet. */
  baseVersion: number | null;
}

const localeOf = (access: ProjectAccess): Locale =>
  isLocale(access.project.locale) ? access.project.locale : "en";

/** The form, filled from the current PRD, else from the interview, else empty headings. */
export async function getPrdBrief(access: ProjectAccess): Promise<PrdBriefView> {
  const gen = getGeneratorCopy(localeOf(access));
  const [doc] = await db
    .select({ content: documents.content, version: documents.version })
    .from(documents)
    .where(and(eq(documents.projectId, access.project.id), eq(documents.slug, "prd")));
  if (doc?.content.trim())
    return {
      brief: splitPrd(doc.content, access.project.name),
      source: "prd",
      baseVersion: doc.version,
    };

  const interview = await findLatestInterview(db, access.project.id);
  if (interview) {
    const data = await readInterviewData(db, interview.id);
    if (data.answers.projectType || data.answers.projectDescription.trim().length >= 10) {
      const generated = createProjectIntelligence(localeOf(access)).generate(data).project;
      return {
        brief: splitPrd(generated.prd, access.project.name),
        source: "interview",
        baseVersion: doc?.version ?? null,
      };
    }
  }
  return {
    brief: {
      title: `${gen.prd.title}: ${access.project.name}`,
      sections: gen.prd.headings.map((heading) => ({ heading, body: "" })),
    },
    source: "empty",
    baseVersion: doc?.version ?? null,
  };
}

const enhanceInput = z.object({
  brief: prdBriefInput,
  index: z.number().int().min(0),
});

const SYSTEM = [
  "You improve one section of a product requirements document (PRD) for a software project.",
  "Rewrite the section so it is specific, complete and testable, in the same language as the document.",
  "Keep every fact the section states; add detail only where the project data supports it, and write",
  "any remaining unknown as an open question rather than guessing. Use markdown lists and short",
  "paragraphs. Return only the section body, without its heading.",
].join(" ");

const enhancedBody = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SECTION_CHARS)
  // A model may repeat the heading; the form already shows it.
  .transform((v) => v.replace(/^#{1,3}\s+[^\n]*\n+/, "").trim())
  .pipe(z.string().min(1));

export interface EnhanceResult {
  body: string;
  deterministic: boolean;
  model: string;
}

/** Enhance one section. With no model set up, the rules-only tidy-up answers instead. */
export async function enhancePrdSection(
  actor: Actor,
  slug: string,
  raw: unknown,
  options: { provider?: AiProvider } = {},
): Promise<EnhanceResult> {
  const { brief, index } = parse(enhanceInput, raw);
  const section = brief.sections[index];
  if (!section) throw new AppError("VALIDATION_ERROR", "No such section", { index: "invalid" });
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  if (!(await allow(`prd-ai:${actor.id}`, 60, 60 * 60_000))) throw new AppError("RATE_LIMIT");

  const draft = enhanceDeterministic(section.body);
  const reqs = await db
    .select({ title: requirements.title, description: requirements.description })
    .from(requirements)
    .where(eq(requirements.projectId, access.project.id))
    .orderBy(asc(requirements.position))
    .limit(60);
  const skills = await platformSkillsFor("prd_generation", section.heading, 1);
  const others = brief.sections
    .filter((_, i) => i !== index)
    .map((s) => `## ${s.heading}\n${s.body.slice(0, 600)}`)
    .join("\n\n");

  const outcome = await runAi({
    access,
    operation: "document_generation",
    required: ["text"],
    override: options.provider,
    run: async (client) => {
      if (client.deterministic) return null;
      const text = await client.generate({
        system: SYSTEM,
        segments: [
          ...skillSegments(skills),
          { kind: "project_data", label: "PRD title", content: brief.title },
          { kind: "project_data", label: "other sections (excerpts)", content: others || "(none)" },
          {
            kind: "project_data",
            label: "recorded requirements",
            content: reqs.map((r) => `- ${r.title}: ${r.description}`).join("\n") || "(none)",
          },
          { kind: "project_data", label: `section: ${section.heading}`, content: section.body },
        ],
        userMessage: `Improve the section "${section.heading}".`,
        draft,
        maxOutputTokens: 2000,
      });
      const checked = enhancedBody.safeParse(text);
      return checked.success ? checked.data : null;
    },
  });
  if (outcome.value === null || outcome.deterministic)
    return { body: draft, deterministic: true, model: "rules" };
  return { body: outcome.value, deterministic: false, model: outcome.actual.label };
}

const saveInput = z.object({
  brief: prdBriefInput,
  baseVersion: z.number().int().min(1).nullable(),
});

/**
 * Saves the form as the PRD: the first version when there is none, otherwise a new version on top
 * of `baseVersion` (refused when someone saved in between, or when the PRD is signed).
 */
export async function savePrdBrief(actor: Actor, slug: string, raw: unknown) {
  const { brief, baseVersion } = parse(saveInput, raw);
  const content = renderPrd(brief);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    if (baseVersion === null) return insertPrdTx(tx, access, content, "generated");
    const { version, changed } = await saveDocumentTx(tx, access, {
      docSlug: "prd",
      content,
      baseVersion,
      source: "user",
    });
    // A regenerated PRD is a new document in all but name: it is approved again before work
    // follows it (signatures were already cleared with the new version).
    if (changed)
      await tx
        .update(documents)
        .set({ status: "draft" })
        .where(
          and(
            eq(documents.projectId, access.project.id),
            eq(documents.slug, "prd"),
            inArray(documents.status, ["approved", "review"]),
          ),
        );
    return { version };
  });
}
