import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  CiStatus,
  DeployEnvironment,
  DeploymentState,
  DeployOwner,
  DeployTargetStatus,
  TaskLinkKind,
  TaskLinkState,
} from "@/lib/domain/enums";
import { credentials } from "./platform";
import { projects } from "./projects";
import { tasks } from "./workspace";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
const projectRef = () =>
  uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" });

/** A task's branch, pull request or commit, found by its short reference (`T-1a2b3c4d`). */
export const taskLinks = pgTable(
  "task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: text("kind").$type<TaskLinkKind>().notNull(),
    /** Branch name, PR number or commit sha. */
    ref: text("ref").notNull(),
    url: text("url"),
    title: text("title").notNull().default(""),
    state: text("state").$type<TaskLinkState>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("task_links_unique_idx").on(t.taskId, t.kind, t.ref),
    index("task_links_project_idx").on(t.projectId, t.updatedAt.desc()),
    check("task_links_kind_check", sql`${t.kind} in ('branch','pr','commit')`),
  ],
);

/** One CI check or workflow run reported by the repository host. */
export const ciRuns = pgTable(
  "ci_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    /** The host's id of the run or suite; unique per project. */
    externalId: text("external_id").notNull(),
    sha: text("sha").notNull(),
    branch: text("branch"),
    name: text("name").notNull(),
    status: text("status").$type<CiStatus>().notNull(),
    conclusion: text("conclusion"),
    url: text("url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("ci_runs_external_idx").on(t.projectId, t.externalId),
    index("ci_runs_project_idx").on(t.projectId, t.updatedAt.desc()),
  ],
);

/** A deployment of the project, from the host's deployment status or from Vercel itself. */
export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    environment: text("environment").$type<DeployEnvironment>().notNull(),
    state: text("state").$type<DeploymentState>().notNull(),
    url: text("url"),
    sha: text("sha"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("deployments_external_idx").on(t.projectId, t.provider, t.externalId),
    index("deployments_project_idx").on(t.projectId, t.updatedAt.desc()),
  ],
);

/** Where a project is published. One per project; the client's own token lives in `credentials`. */
export const deployTargets = pgTable(
  "deploy_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef().unique(),
    owner: text("owner").$type<DeployOwner>().notNull().default("saqina"),
    credentialId: uuid("credential_id").references(() => credentials.id, { onDelete: "set null" }),
    teamId: text("team_id"),
    vercelProjectId: text("vercel_project_id"),
    domain: text("domain"),
    status: text("status").$type<DeployTargetStatus>().notNull().default("pending"),
    lastError: text("last_error"),
    lastDeployedAt: timestamp("last_deployed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // A domain belongs to one project.
    uniqueIndex("deploy_targets_domain_idx").on(t.domain),
    check("deploy_targets_owner_check", sql`${t.owner} in ('saqina','client')`),
  ],
);
