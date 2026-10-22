import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { SkillOrigin, SkillOutcome } from "@/lib/domain/memory";
import { users } from "./auth";
import { memoryAssets } from "./memory";
import { projects } from "./projects";
import { agents } from "./workspace";

export interface SkillStep {
  title: string;
  detail: string;
}
export interface SkillResource {
  label: string;
  /** A link or a repository path; the skill never embeds a file. */
  ref: string;
}
export interface SkillEvaluation {
  score: number;
  issues: string[];
}

/**
 * A reusable workflow. The registry row (`asset_id`) holds owner, visibility, status and version
 * like every asset; this row holds what the workflow says. Each saved version is also kept as
 * JSON in `memory_versions`, so history and diffs need nothing more.
 */
export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .unique()
      .references(() => memoryAssets.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    useCase: text("use_case").notNull().default(""),
    triggers: jsonb("triggers").$type<string[]>().notNull().default([]),
    exclusions: jsonb("exclusions").$type<string[]>().notNull().default([]),
    prerequisites: jsonb("prerequisites").$type<string[]>().notNull().default([]),
    steps: jsonb("steps").$type<SkillStep[]>().notNull().default([]),
    outputs: jsonb("outputs").$type<string[]>().notNull().default([]),
    validation: jsonb("validation").$type<string[]>().notNull().default([]),
    resources: jsonb("resources").$type<SkillResource[]>().notNull().default([]),
    origin: text("origin").$type<SkillOrigin>().notNull().default("manual"),
    /** The agent run a proposed skill came from; one skill per run. */
    originRef: text("origin_ref"),
    evaluation: jsonb("evaluation").$type<SkillEvaluation>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("skills_origin_idx")
      .on(t.projectId, t.originRef)
      .where(sql`${t.originRef} is not null`),
    index("skills_project_idx").on(t.projectId),
    check("skills_origin_check", sql`${t.origin} in ('manual','run')`),
  ],
);

/** Every use of a skill and how it went: the evidence a skill is trusted (or retired) on. */
export const skillUsages = pgTable(
  "skill_usages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => memoryAssets.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    runId: uuid("run_id"),
    skillVersion: integer("skill_version").notNull(),
    outcome: text("outcome").$type<SkillOutcome>(),
    /** Who said how it went: a person, the agent, or only the run that ended (which says nothing about this skill). */
    settledBy: text("settled_by").$type<"user" | "agent" | "run">(),
    /** A short remark, scrubbed of secrets. */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("skill_usages_asset_idx").on(t.assetId, t.createdAt.desc()),
    index("skill_usages_run_idx").on(t.runId),
    // One use per skill, agent and run, however often a run is planned again.
    uniqueIndex("skill_usages_run_agent_idx")
      .on(t.assetId, t.runId, t.agentId)
      .where(sql`${t.runId} is not null`),
    check(
      "skill_usages_settled_by_check",
      sql`${t.settledBy} is null or ${t.settledBy} in ('user','agent','run')`,
    ),
    check(
      "skill_usages_outcome_check",
      sql`${t.outcome} is null or ${t.outcome} in ('success','partial','failure')`,
    ),
  ],
);
