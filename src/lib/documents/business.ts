import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import type { Locale } from "@/i18n/locales";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { todayIso } from "@/lib/billing/rules";
import { listTerms } from "@/lib/billing/terms";
import { db, type Tx } from "@/lib/db/client";
import {
  clients,
  documents,
  documentVersions,
  interviewAnswers,
  interviews,
  maintenancePlans,
  milestones,
  organizations,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { listScope } from "@/lib/scope/service";
import { parse } from "@/lib/validation";
import {
  BUSINESS_DOC_SLUGS,
  type BusinessDocInput,
  type BusinessDocKind,
  renderBusinessDoc,
} from "./business-templates";

export const BUSINESS_DOC_KINDS = Object.keys(BUSINESS_DOC_SLUGS) as BusinessDocKind[];

type Project = Awaited<ReturnType<typeof loadProjectAccess>>["project"];

async function inputFor(tx: Tx, project: Project, locale: Locale): Promise<BusinessDocInput> {
  const [org] = await tx
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, project.organizationId));
  const [client] = project.clientId
    ? await tx
        .select({ name: clients.name, company: clients.company })
        .from(clients)
        .where(eq(clients.id, project.clientId))
    : [];
  const [objective] = await tx
    .select({ answer: interviewAnswers.answer })
    .from(interviewAnswers)
    .innerJoin(interviews, eq(interviews.id, interviewAnswers.interviewId))
    .where(and(eq(interviews.projectId, project.id), eq(interviewAnswers.questionKey, "objective")))
    .limit(1);
  const [scope, terms, ms, plans] = await Promise.all([
    listScope(project.id, tx),
    listTerms(project.id, tx),
    tx
      .select({ title: milestones.title, goal: milestones.goal })
      .from(milestones)
      .where(eq(milestones.projectId, project.id))
      .orderBy(asc(milestones.position)),
    tx
      .select()
      .from(maintenancePlans)
      .where(
        and(
          eq(maintenancePlans.projectId, project.id),
          inArray(maintenancePlans.status, ["active", "ended"]),
        ),
      )
      .orderBy(desc(maintenancePlans.endDate))
      .limit(1),
  ]);
  return {
    locale,
    today: todayIso(),
    org: org?.name ?? "",
    client: client ?? null,
    project: {
      name: project.name,
      description: project.description,
      objective: typeof objective?.answer === "string" ? objective.answer : null,
    },
    currency: project.currency,
    value: project.value,
    scope: scope.map((s) => ({ title: s.title, description: s.description, category: s.category })),
    terms: terms.map((t) => ({ label: t.label, amount: t.amount, dueDate: t.dueDate })),
    milestones: ms,
    warrantyUntil: project.warrantyUntil,
    plan: plans[0]
      ? {
          name: plans[0].name,
          startDate: plans[0].startDate,
          endDate: plans[0].endDate,
          fee: plans[0].fee,
          cycle: plans[0].cycle,
          scope: plans[0].scope,
          excluded: plans[0].excluded,
          responseHours: plans[0].responseHours,
        }
      : null,
  };
}

/**
 * Creates or regenerates a business document as a draft. Regenerating keeps every earlier
 * version in history; a signed document is never overwritten.
 */
export async function generateBusinessDocumentTx(
  tx: Tx,
  access: { actor: Actor; project: Project },
  kind: BusinessDocKind,
  locale: Locale,
) {
  const { project, actor } = access;
  const slug = BUSINESS_DOC_SLUGS[kind];
  const { title, content } = renderBusinessDoc(kind, await inputFor(tx, project, locale));
  const [existing] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, project.id), eq(documents.slug, slug)))
    .for("update");
  if (existing && (existing.status === "signed" || existing.status === "archived"))
    throw new AppError("CONFLICT", "Signed documents are not regenerated", {
      kind: "documents.signedLocked",
    });
  let id: string;
  let version = 1;
  if (existing) {
    version = existing.version + 1;
    id = existing.id;
    await tx
      .update(documents)
      .set({ content, title, version, status: "draft", clientVisible: false, updatedBy: actor.id })
      .where(eq(documents.id, existing.id));
  } else {
    const [row] = await tx
      .insert(documents)
      .values({
        projectId: project.id,
        type: kind,
        title,
        slug,
        content,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning({ id: documents.id });
    id = row.id;
  }
  await tx
    .insert(documentVersions)
    .values({ documentId: id, version, content, createdBy: actor.id });
  await recordActivity(tx, {
    projectId: project.id,
    actorId: actor.id,
    type: existing ? "document.updated" : "document.created",
    entityType: "document",
    entityId: id,
    metadata: { slug, version, generated: kind },
  });
  return { slug, version };
}

export async function generateBusinessDocument(
  actor: Actor,
  slug: string,
  input: unknown,
  locale: Locale,
) {
  const { kind } = parse(
    z.object({ kind: z.enum(BUSINESS_DOC_KINDS as [BusinessDocKind]) }),
    input,
  );
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "project:update", tx);
    return generateBusinessDocumentTx(tx, access, kind, locale);
  });
}
