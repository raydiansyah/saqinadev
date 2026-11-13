import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import type { Locale } from "@/i18n/locales";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { activities, clients, projectMembers, projectSettings, projects } from "@/lib/db/schema";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { activeOrg } from "@/lib/organizations/service";
import { slugify } from "@/lib/slug";
import { parse } from "@/lib/validation";
import { listMemberProjects, type ProjectRow, slugExists } from "./repository";

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");
}

/** "restaurant-pos-k3x9": readable, unique, and not a database id. */
async function uniqueSlug(name: string, executor = db): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${randomSuffix()}`;
    if (!(await slugExists(executor, slug))) return slug;
  }
  throw new AppError("CONFLICT", "Could not allocate a project slug");
}

const createInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).default(""),
  clientId: z.uuid().nullable().default(null),
});

/** A project is a plain container for one client's invoices, receipts, contracts and reminders. */
export async function createProject(
  actor: Actor,
  input: unknown,
  locale: Locale,
): Promise<{ slug: string }> {
  const { name, description, clientId } = parse(createInput, input);
  return db.transaction(async (tx) => {
    const { org } = await activeOrg(actor, tx);
    if (clientId) {
      const [client] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.organizationId, org.id)));
      // A client of another organization looks the same as one that does not exist.
      if (!client) throw new AppError("NOT_FOUND");
    }
    const slug = await uniqueSlug(name, tx);
    const [project] = await tx
      .insert(projects)
      .values({
        slug,
        ownerId: actor.id,
        organizationId: org.id,
        clientId,
        currency: org.defaultCurrency,
        name,
        nameSource: "user",
        description,
        status: "planning",
        locale,
      })
      .returning();
    await tx
      .insert(projectMembers)
      .values({ projectId: project.id, userId: actor.id, role: "owner" });
    await tx.insert(projectSettings).values({ projectId: project.id });
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "project.created",
      entityType: "project",
      entityId: project.id,
      metadata: { name },
    });
    return { slug };
  });
}

export interface ProjectSummary {
  slug: string;
  name: string;
  description: string;
  status: ProjectRow["status"];
  archived: boolean;
  updatedAt: Date;
}

export async function listProjects(
  actor: Actor,
  options: { archived?: boolean } = {},
): Promise<ProjectSummary[]> {
  const rows = await listMemberProjects(db, actor.id, options);
  return rows.map((p) => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
    status: p.status,
    archived: p.archivedAt !== null,
    updatedAt: p.updatedAt,
  }));
}

const generalInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000),
});

export async function updateProjectGeneral(actor: Actor, slug: string, input: unknown) {
  const data = parse(generalInput, input);
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    // A name a person chose is theirs: the plan no longer renames the project.
    const renamed = data.name !== project.name;
    await tx
      .update(projects)
      .set({ ...data, ...(renamed ? { nameSource: "user" as const } : {}) })
      .where(eq(projects.id, project.id));
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "project.updated",
      entityType: "project",
      entityId: project.id,
      metadata: { fields: "name,description" },
    });
  });
}

export async function setProjectArchived(actor: Actor, slug: string, archived: boolean) {
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:archive", tx);
    if (archived === (project.status === "archived")) return;

    let status: ProjectStatus = "archived";
    if (!archived) {
      // The status before archiving is kept on the archive event, so restore is exact.
      const [last] = await tx
        .select({ metadata: activities.metadata })
        .from(activities)
        .where(and(eq(activities.projectId, project.id), eq(activities.type, "project.archived")))
        .orderBy(desc(activities.createdAt))
        .limit(1);
      const previous = last?.metadata.previousStatus;
      status = isProjectStatus(previous) && previous !== "archived" ? previous : "planning";
    }
    await tx
      .update(projects)
      .set({ status, archivedAt: archived ? new Date() : null })
      .where(eq(projects.id, project.id));
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: archived ? "project.archived" : "project.restored",
      entityType: "project",
      entityId: project.id,
      metadata: archived ? { previousStatus: project.status } : { status },
    });
  });
}

const isProjectStatus = (value: unknown): value is ProjectStatus =>
  typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);

/** Permanent. The caller must type the exact project name to confirm. */
export async function deleteProject(actor: Actor, slug: string, confirmName: unknown) {
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:delete", tx);
    if (typeof confirmName !== "string" || confirmName.trim() !== project.name) {
      throw new AppError("VALIDATION_ERROR", "Name does not match", { confirmName: "mismatch" });
    }
    await tx.delete(projects).where(eq(projects.id, project.id));
  });
}
