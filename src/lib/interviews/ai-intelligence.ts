import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import { agentCan } from "@/lib/agents/capabilities";
import { ensureTeamAgents } from "@/lib/agents/registry";
import { runAi } from "@/lib/ai/gateway";
import type { AiProvider, PromptSegment } from "@/lib/ai/provider";
import type { PlannedAction } from "@/lib/assistant/actions/types";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { agents, documents, projects } from "@/lib/db/schema";
import { EventBatch } from "@/lib/events/emitter";
import { log } from "@/lib/log";
import { createProposalTx } from "@/lib/proposals/repository";
import { skillSegments } from "@/lib/skills/prompt";
import { platformSkillsFor } from "@/lib/skills/service";
import { findLatestInterview, readInterviewData } from "./repository";

/**
 * After the interview, a model refines what the rules generated, following the Superpowers
 * skills: `brainstorming` for the PRD and `writing-plans` for the plan document. It never writes
 * directly: each rewrite is a proposal from the planner agent that a person approves. The only
 * direct change is the project name, and only while nobody has named the project themselves.
 * With no model set up nothing happens and the generated drafts stay as they are.
 */

const SYSTEM_DOC = [
  "You refine a generated draft document for a software project, following the method in the skill",
  "given to you. Keep the draft's structure, its headings and every confirmed fact; make each",
  "section specific and testable; turn guesses into explicit open questions. Write in the same",
  "language as the draft. Return the whole document as markdown starting with its # title.",
].join(" ");

const SYSTEM_TITLE = [
  "Name a software project from its plan: a short product name of two to five words, in the language",
  "of the plan, without quotes, emoji or a trailing full stop.",
].join(" ");

const titleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[^\n<>#*`"]+$/),
});

/** A refined document is accepted only if it still looks like the whole document. */
export function acceptRefined(text: string, minSections: number): string | null {
  const content = text
    .trim()
    .replace(/^```(?:markdown|md)?\n([\s\S]*)\n```$/, "$1")
    .trim();
  if (!content.startsWith("# ") || content.length > 200_000) return null;
  const sections = content.match(/^## /gm)?.length ?? 0;
  return sections >= minSections ? `${content}\n` : null;
}

const REFINE_COPY = {
  en: {
    title: "Refined PRD and plan from the interview",
    description: (agent: string) =>
      `Written by ${agent} with the Superpowers skills. Approve to apply; edit the documents first to keep your own version.`,
    prdSummary: "PRD refined with the Superpowers brainstorming skill.",
    planSummary: "Plan refined with the Superpowers writing-plans skill.",
  },
  id: {
    title: "PRD dan plan yang disempurnakan dari interview",
    description: (agent: string) =>
      `Ditulis oleh ${agent} dengan skill Superpowers. Setujui untuk menerapkan; edit dokumennya lebih dulu bila ingin memakai versi Anda sendiri.`,
    prdSummary: "PRD disempurnakan dengan skill brainstorming Superpowers.",
    planSummary: "Plan disempurnakan dengan skill writing-plans Superpowers.",
  },
} as const;

interface RefineResult {
  renamed: boolean;
  proposals: number;
}

export async function refineAfterInterview(
  actor: Actor,
  slug: string,
  options: { provider?: AiProvider } = {},
): Promise<RefineResult> {
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  const projectId = access.project.id;
  const nameAtStart = access.project.name;
  const interview = await findLatestInterview(db, projectId);
  if (!interview || interview.status !== "completed") return { renamed: false, proposals: 0 };
  const data = await readInterviewData(db, interview.id);

  // Team agents are created on first use; the planner must exist to author the proposal.
  await ensureTeamAgents(db, projectId);
  const [docs, planners] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, projectId), inArray(documents.slug, ["prd", "plan"]))),
    db
      .select()
      .from(agents)
      .where(
        and(eq(agents.projectId, projectId), eq(agents.type, "saqina"), eq(agents.role, "planner")),
      ),
  ]);
  const planner = planners.find((a) => agentCan(a, "write_documents"));
  const answers: PromptSegment = {
    kind: "project_data",
    label: "interview answers",
    content: JSON.stringify({ answers: data.answers, details: data.details }).slice(0, 20_000),
  };

  const outcome = await runAi({
    access,
    operation: "document_generation",
    required: ["text"],
    override: options.provider,
    run: async (client) => {
      if (client.deterministic) return null;
      const refine = async (
        doc: (typeof docs)[number],
        use: "prd_generation" | "plan_generation",
      ) => {
        // Only the untouched first draft: anything a person changed is theirs.
        if (doc.version !== 1 || doc.status !== "draft") return null;
        const skills = await platformSkillsFor(use, doc.title, 1);
        try {
          const text = await client.generate({
            system: SYSTEM_DOC,
            segments: [
              ...skillSegments(skills),
              answers,
              { kind: "project_data", label: `draft ${doc.slug}`, content: doc.content },
            ],
            userMessage: `Refine the ${doc.slug === "prd" ? "PRD" : "plan"} draft.`,
            draft: doc.content,
            maxOutputTokens: 8000,
          });
          const accepted = acceptRefined(text, doc.slug === "prd" ? 5 : 2);
          return accepted && accepted.trim() !== doc.content.trim() ? accepted : null;
        } catch (error) {
          log.warn("interview.refine_failed", { doc: doc.slug, error: String(error) });
          return null;
        }
      };
      const prd = docs.find((d) => d.slug === "prd");
      const plan = docs.find((d) => d.slug === "plan");
      const [title, prdText, planText] = await Promise.all([
        access.project.nameSource === "auto"
          ? client
              .generateObject(
                {
                  system: SYSTEM_TITLE,
                  segments: [
                    answers,
                    {
                      kind: "project_data",
                      label: "plan",
                      content: (plan ?? prd)?.content.slice(0, 8000) ?? "",
                    },
                  ],
                  userMessage: "Name this project.",
                  draft: "",
                  maxOutputTokens: 100,
                },
                titleSchema,
                "project_title",
              )
              .then((r) => r.title)
              .catch(() => null)
          : null,
        prd ? refine(prd, "prd_generation") : null,
        plan ? refine(plan, "plan_generation") : null,
      ]);
      return {
        title,
        prd: prd && prdText ? { doc: prd, text: prdText } : null,
        plan: plan && planText ? { doc: plan, text: planText } : null,
      };
    },
  });
  const value = outcome.value;
  if (!value) return { renamed: false, proposals: 0 };

  const copy = REFINE_COPY[access.project.locale === "id" ? "id" : "en"];
  const batch = new EventBatch();
  const result = await db.transaction(async (tx) => {
    let renamed = false;
    if (value.title && value.title !== nameAtStart) {
      // Only while the name is still the generated one nobody has touched.
      const rows = await tx
        .update(projects)
        .set({ name: value.title })
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.nameSource, "auto"),
            eq(projects.name, nameAtStart),
          ),
        )
        .returning({ id: projects.id });
      renamed = rows.length > 0;
      if (renamed)
        await recordActivity(tx, {
          projectId,
          actorId: actor.id,
          type: "project.updated",
          entityType: "project",
          entityId: projectId,
          metadata: { fields: "name", origin: "ai_title" },
        });
    }
    let proposals = 0;
    if (planner) {
      const actions: PlannedAction[] = [];
      for (const [i, item] of [value.prd, value.plan].entries()) {
        if (!item) continue;
        actions.push({
          type: "UPDATE_DOCUMENT",
          key: `doc${i + 1}`,
          payload: {
            docSlug: item.doc.slug,
            content: item.text,
            baseVersion: item.doc.version,
            agentId: planner.id,
            summary: item.doc.slug === "prd" ? copy.prdSummary : copy.planSummary,
          },
          before: { title: item.doc.title, content: item.doc.content },
        });
      }
      if (actions.length > 0) {
        await createProposalTx(
          tx,
          access,
          {
            type: "agent_result",
            title: copy.title,
            description: copy.description(planner.name),
            actions,
          },
          batch,
        );
        proposals = 1;
      }
    }
    return { renamed, proposals };
  });
  batch.flush();
  return result;
}

/**
 * Runs the refinement after the response is sent: finishing the interview never waits on a
 * model, and a failure only means the generated drafts stay as they are.
 */
export function scheduleInterviewRefinement(actor: Actor, slug: string) {
  try {
    after(async () => {
      try {
        await refineAfterInterview(actor, slug);
      } catch (error) {
        log.warn("interview.refine_schedule_failed", { error: String(error) });
      }
    });
  } catch {
    // Not inside a request (a script or a test): nothing to schedule.
  }
}
