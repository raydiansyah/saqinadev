import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db, type Executor } from "@/lib/db/client";
import { platformSkills } from "@/lib/db/schema";
import { SKILL_USES, type SkillUse } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { assertSafeEndpoint } from "@/lib/net/endpoint-guard";
import { requirePlatformOwner } from "@/lib/platform/roles";
import { allow } from "@/lib/rate-limit";
import { parse } from "@/lib/validation";
import { BUILTIN_SKILLS, builtinSkill } from "./builtin";
import { MAX_SKILL_BYTES, normalizeGithubSkillUrl, parseSkillMd } from "./parse";
import { type PromptSkill, rankSkills } from "./prompt";

/**
 * Skills the platform owner installs once for every project (Settings > AI > Skills). Only the
 * SKILL.md text is kept; nothing in it is ever run. Every change is audited without the text.
 */

export interface PlatformSkillView {
  id: string;
  slug: string;
  name: string;
  description: string;
  source: "builtin" | "paste" | "github";
  sourceUrl: string | null;
  uses: SkillUse[];
  enabled: boolean;
  content: string;
  updatedAt: Date;
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Puts the built-in skills in the table, switched on, the first time anyone looks. */
export async function ensureBuiltinSkills(executor: Executor = db): Promise<void> {
  await executor
    .insert(platformSkills)
    .values(
      BUILTIN_SKILLS.map((s) => ({
        slug: s.slug,
        name: s.name,
        description: s.description,
        source: "builtin" as const,
        sourceUrl: s.sourceUrl,
        contentHash: sha(s.content),
        uses: s.uses,
      })),
    )
    .onConflictDoNothing({ target: platformSkills.slug });
}

const toView = (row: typeof platformSkills.$inferSelect): PlatformSkillView => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  source: row.source,
  sourceUrl: row.sourceUrl,
  uses: row.uses,
  enabled: row.enabled,
  content: row.source === "builtin" ? (builtinSkill(row.slug)?.content ?? "") : row.content,
  updatedAt: row.updatedAt,
});

export async function listPlatformSkills(actor: Actor): Promise<PlatformSkillView[]> {
  await requirePlatformOwner(actor);
  await ensureBuiltinSkills();
  const rows = await db.select().from(platformSkills).orderBy(platformSkills.name);
  return rows.map(toView);
}

const usesInput = z.array(z.enum(SKILL_USES)).min(1).max(SKILL_USES.length);
const pasteInput = z.object({
  content: z.string().max(MAX_SKILL_BYTES),
  uses: usesInput.default(["agent_run", "assistant"]),
});
const githubInput = z.object({
  url: z.string().trim().min(1).max(500),
  uses: usesInput.default(["agent_run", "assistant"]),
});

async function insertSkill(
  actor: Actor,
  text: string,
  source: "paste" | "github",
  sourceUrl: string | null,
  uses: SkillUse[],
) {
  const skill = parseSkillMd(text);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(platformSkills)
      .values({
        slug: skill.name,
        name: skill.name,
        description: skill.description,
        source,
        sourceUrl,
        content: text,
        contentHash: sha(text),
        uses: [...new Set(uses)],
        installedBy: actor.id,
      })
      .onConflictDoNothing({ target: platformSkills.slug })
      .returning({ id: platformSkills.id });
    if (!row) throw new AppError("CONFLICT", "Skill exists", { content: "exists" });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "skill.installed",
      entityType: "platform_skill",
      entityId: row.id,
      metadata: { slug: skill.name, source },
    });
    return { id: row.id, slug: skill.name };
  });
}

export async function installSkillFromText(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { content, uses } = parse(pasteInput, input);
  return insertSkill(actor, content, "paste", null, uses);
}

export type SkillFetcher = (url: string) => Promise<string>;

const fetchText: SkillFetcher = async (url) => {
  await assertSafeEndpoint(url);
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "text/plain" },
  });
  if (!response.ok) throw new AppError("VALIDATION_ERROR", "Fetch failed", { url: "unreachable" });
  const text = await response.text();
  if (text.length > MAX_SKILL_BYTES)
    throw new AppError("VALIDATION_ERROR", "Skill too large", { url: "tooLarge" });
  return text;
};

/** Installs a SKILL.md from a GitHub link. The fetch is limited in host, time and size. */
export async function installSkillFromGithub(
  actor: Actor,
  input: unknown,
  fetcher: SkillFetcher = fetchText,
) {
  await requirePlatformOwner(actor);
  const { url, uses } = parse(githubInput, input);
  const raw = normalizeGithubSkillUrl(url);
  if (!(await allow(`skills:install:${actor.id}`, 10, 60 * 60_000)))
    throw new AppError("RATE_LIMIT");
  let text: string;
  try {
    text = await fetcher(raw);
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.warn("skills.fetch_failed", { error: error instanceof Error ? error.name : "error" });
    throw new AppError("VALIDATION_ERROR", "Fetch failed", { url: "unreachable" });
  }
  return insertSkill(actor, text, "github", url, uses);
}

const updateInput = z.object({
  id: z.uuid(),
  enabled: z.boolean().optional(),
  uses: usesInput.optional(),
});

export async function updatePlatformSkill(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { id, enabled, uses } = parse(updateInput, input);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(platformSkills)
      .set({
        ...(enabled === undefined ? {} : { enabled }),
        ...(uses === undefined ? {} : { uses: [...new Set(uses)] }),
      })
      .where(eq(platformSkills.id, id))
      .returning({ slug: platformSkills.slug });
    if (!row) throw new AppError("NOT_FOUND");
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "skill.updated",
      entityType: "platform_skill",
      entityId: id,
      metadata: { slug: row.slug, enabled: enabled ?? null, uses: uses?.join(",") ?? null },
    });
  });
}

export async function removePlatformSkill(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { id } = parse(z.object({ id: z.uuid() }), input);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(platformSkills).where(eq(platformSkills.id, id));
    if (!row) throw new AppError("NOT_FOUND");
    // A built-in skill ships with Saqina: it can be switched off, not removed.
    if (row.source === "builtin") throw new AppError("CONFLICT", "Built-in", { id: "builtin" });
    await tx.delete(platformSkills).where(eq(platformSkills.id, id));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "skill.removed",
      entityType: "platform_skill",
      entityId: id,
      metadata: { slug: row.slug },
    });
  });
}

/**
 * The switched-on skills for one use, best matches first. Called by generators and runs, not by
 * people, so it needs no actor; it only ever returns text the owner chose to install.
 */
export async function platformSkillsFor(
  use: SkillUse,
  taskText = "",
  limit = 3,
): Promise<PromptSkill[]> {
  try {
    await ensureBuiltinSkills();
    const rows = await db
      .select()
      .from(platformSkills)
      .where(and(eq(platformSkills.enabled, true)));
    const usable = rows.filter((r) => r.uses.includes(use)).map(toView);
    return rankSkills(usable, taskText, limit).map((s) => ({
      slug: s.slug,
      name: s.name,
      content: s.content,
      builtin: s.source === "builtin",
    }));
  } catch (error) {
    // Skills improve an answer; their absence never stops one.
    log.warn("skills.load_failed", { error: error instanceof Error ? error.name : "error" });
    return [];
  }
}

export interface UsableSkill {
  slug: string;
  name: string;
  description: string;
}

/** Switched-on skills a project member may pick in the chat; names only, never the text. */
export async function listUsableSkills(): Promise<UsableSkill[]> {
  await ensureBuiltinSkills();
  return db
    .select({
      slug: platformSkills.slug,
      name: platformSkills.name,
      description: platformSkills.description,
    })
    .from(platformSkills)
    .where(eq(platformSkills.enabled, true))
    .orderBy(platformSkills.name);
}

/** The switched-on skills a person picked by slug, for the prompt. Unknown slugs are skipped. */
export async function platformSkillsBySlugs(slugs: string[]): Promise<PromptSkill[]> {
  if (slugs.length === 0) return [];
  // The built-in rows are created the first time anything looks at skills.
  await ensureBuiltinSkills();
  const rows = await db
    .select()
    .from(platformSkills)
    .where(and(eq(platformSkills.enabled, true), inArray(platformSkills.slug, slugs)));
  return rows.map(toView).map((s) => ({
    slug: s.slug,
    name: s.name,
    content: s.content,
    builtin: s.source === "builtin",
  }));
}
