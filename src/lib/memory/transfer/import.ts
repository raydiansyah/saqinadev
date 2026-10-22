import "server-only";
import { and, count, eq, inArray, or, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { memoryAssets, memoryTombstones } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";
import { containsSecret } from "@/lib/secrets/scan";
import { contentHash, skillTombKeys, textTombKeys, tombstoneKey } from "../hash";
import { evaluateSkill, type SkillContent } from "../skills/content";
import { insertSkill } from "../skills/store";
import { insertChatMemory } from "../store";
import {
  checksumOf,
  itemSchema,
  MAX_IMPORT_ITEMS,
  type PackageItem,
  packageSchema,
} from "./package";

/** Candidates one person may have waiting: an import cannot bury the review queue. */
const MAX_PENDING = 200;

export interface ImportResult {
  memories: number;
  skills: number;
  skipped: {
    duplicate: number;
    blocked: number;
    previouslyRemoved: number;
    invalid: number;
    backlog: number;
  };
}

/**
 * Invisible format characters (zero-width joiners and the like) and compatibility forms are
 * removed before anything is checked or stored: a secret broken up by them would pass a scan.
 */
const clean = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .trim();

const cleanSkill = (c: SkillContent): SkillContent => ({
  name: clean(c.name),
  description: clean(c.description),
  useCase: clean(c.useCase),
  triggers: c.triggers.map(clean).filter(Boolean),
  exclusions: c.exclusions.map(clean).filter(Boolean),
  prerequisites: c.prerequisites.map(clean).filter(Boolean),
  steps: c.steps
    .map((s) => ({ title: clean(s.title), detail: clean(s.detail) }))
    .filter((s) => s.title),
  outputs: c.outputs.map(clean).filter(Boolean),
  validation: c.validation.map(clean).filter(Boolean),
  resources: c.resources
    .map((r) => ({ label: clean(r.label), ref: clean(r.ref) }))
    .filter((r) => r.label && r.ref),
});

const skillTexts = (c: SkillContent) => [
  c.name,
  c.description,
  c.useCase,
  ...c.triggers,
  ...c.exclusions,
  ...c.prerequisites,
  ...c.outputs,
  ...c.validation,
  ...c.resources.flatMap((r) => [r.label, r.ref]),
  ...c.steps.flatMap((s) => [s.title, s.detail]),
];

/**
 * Reads a package into the project as *candidates*: private to the person importing, waiting for
 * review, exactly like what extraction and agents propose. Nothing in a package can approve, share,
 * pin or own anything: visibility, owner, status, confidence and level are not read from it. Text
 * that looks like a secret is refused, a skill is judged like any proposal, duplicates are skipped,
 * and what was rejected or deleted before stays out. Lookups are made once for the whole package.
 */
export async function importMemoryPackage(
  actor: Actor,
  slug: string,
  raw: unknown,
): Promise<ImportResult> {
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  if (!(await allow(`memory-import:${actor.id}`, 10, 3_600_000))) throw new AppError("RATE_LIMIT");

  const head = packageSchema.safeParse(raw);
  if (!head.success)
    throw new AppError("VALIDATION_ERROR", "invalid_package", { package: "invalid" });
  const { items: rawItems, checksum } = head.data;
  if (checksumOf(rawItems) !== checksum) {
    throw new AppError("VALIDATION_ERROR", "checksum_mismatch", { package: "checksum" });
  }
  if (rawItems.length > MAX_IMPORT_ITEMS) {
    throw new AppError("VALIDATION_ERROR", "too_many_items", { package: "too_many" });
  }

  const result: ImportResult = {
    memories: 0,
    skills: 0,
    skipped: { duplicate: 0, blocked: 0, previouslyRemoved: 0, invalid: 0, backlog: 0 },
  };
  const projectId = access.project.id;

  // Parse and clean every item first; what is not valid is counted and left out.
  const items: PackageItem[] = [];
  for (const rawItem of rawItems) {
    const parsed = itemSchema.safeParse(rawItem);
    if (!parsed.success) {
      result.skipped.invalid++;
      continue;
    }
    const item = parsed.data;
    if (item.type === "memory") {
      const title = clean(item.title);
      const content = clean(item.content);
      if (title.length < 2 || content.length < 1) result.skipped.invalid++;
      else items.push({ ...item, title, content });
    } else {
      const { type: _type, ...rest } = item;
      const content = cleanSkill(rest);
      if (content.name.length < 3 || content.description.length < 10 || content.steps.length < 1) {
        result.skipped.invalid++;
      } else items.push({ type: "skill", ...content });
    }
  }

  await db.transaction(async (tx) => {
    // Two imports by one person into one project take turns, so neither misjudges the room left.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`memimp:${projectId}:${actor.id}`}))`,
    );

    const memoryItems = items.flatMap((i) => (i.type === "memory" ? [i] : []));
    const skillItems = items.flatMap((i) => (i.type === "skill" ? [i] : []));
    const hashes = memoryItems.map((i) => contentHash(i.title, i.content));
    const tombs = new Set(
      (
        await tx
          .select({ k: memoryTombstones.keyHash })
          .from(memoryTombstones)
          .where(
            and(
              eq(memoryTombstones.projectId, projectId),
              inArray(
                memoryTombstones.keyHash,
                [
                  ...memoryItems.flatMap((i) => textTombKeys(i.title, i.content, actor.id)),
                  ...skillItems.flatMap((i) => skillTombKeys(i.name, actor.id)),
                ].map(tombstoneKey),
              ),
            ),
          )
      ).map((r) => r.k),
    );
    // What counts as "already there": the person's own, and what the whole project can see (approved
    // only). Another person's pending or private text is not visible and so cannot be learned.
    const visibleToMe = or(
      eq(memoryAssets.ownerId, actor.id),
      and(eq(memoryAssets.visibility, "project"), eq(memoryAssets.status, "approved")),
    );
    const knownHashes = new Set(
      hashes.length
        ? (
            await tx
              .select({ h: memoryAssets.contentHash })
              .from(memoryAssets)
              .where(
                and(
                  eq(memoryAssets.projectId, projectId),
                  inArray(memoryAssets.contentHash, hashes),
                  visibleToMe,
                ),
              )
          ).map((r) => r.h)
        : [],
    );
    const knownNames = new Set(
      skillItems.length
        ? (
            await tx
              .select({ t: sql<string>`lower(${memoryAssets.title})` })
              .from(memoryAssets)
              .where(
                and(
                  eq(memoryAssets.projectId, projectId),
                  eq(memoryAssets.assetType, "skill"),
                  inArray(
                    sql`lower(${memoryAssets.title})`,
                    skillItems.map((i) => i.name.toLowerCase()),
                  ),
                  visibleToMe,
                ),
              )
          ).map((r) => r.t)
        : [],
    );
    const [{ waiting }] = await tx
      .select({ waiting: count() })
      .from(memoryAssets)
      .where(
        and(
          eq(memoryAssets.projectId, projectId),
          eq(memoryAssets.ownerId, actor.id),
          eq(memoryAssets.status, "pending_review"),
        ),
      );
    let room = MAX_PENDING - waiting;

    for (const item of items) {
      if (room <= 0) {
        result.skipped.backlog++;
        continue;
      }
      if (item.type === "memory") {
        const hash = contentHash(item.title, item.content);
        if (containsSecret(`${item.title}\n${item.content}`)) {
          result.skipped.blocked++;
        } else if (
          textTombKeys(item.title, item.content, actor.id).some((k) => tombs.has(tombstoneKey(k)))
        ) {
          result.skipped.previouslyRemoved++;
        } else if (knownHashes.has(hash)) {
          result.skipped.duplicate++;
        } else {
          await insertChatMemory(tx, {
            projectId,
            organizationId: access.project.organizationId,
            title: item.title,
            content: item.content,
            category: item.category,
            importance: item.importance,
            source: "imported",
            createdBy: actor.id,
            ownerId: actor.id,
            visibility: "private",
            status: "pending_review",
            // Level 3 is a person's decision to pin; an import is always facts.
            level: "L1",
            kind: item.kind,
            confidence: "extracted",
            sources: [{ sourceType: "manual", sourceId: actor.id, locator: { import: "package" } }],
          });
          knownHashes.add(hash);
          result.memories++;
          room--;
        }
        continue;
      }

      const { type: _type, ...content } = item;
      const evaluation = evaluateSkill(content);
      const name = content.name.toLowerCase();
      if (evaluation.blocking || skillTexts(content).some(containsSecret)) {
        result.skipped.blocked++;
      } else if (skillTombKeys(content.name, actor.id).some((k) => tombs.has(tombstoneKey(k)))) {
        result.skipped.previouslyRemoved++;
      } else if (knownNames.has(name)) {
        result.skipped.duplicate++;
      } else {
        await insertSkill(tx, access, {
          content,
          ownerId: actor.id,
          createdBy: actor.id,
          visibility: "private",
          status: "pending_review",
          origin: "manual",
          evaluation: { score: evaluation.score, issues: evaluation.issues },
          source: { sourceType: "manual", sourceId: actor.id, locator: { import: "package" } },
        });
        knownNames.add(name);
        result.skills++;
        room--;
      }
    }
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId,
      type: "memory.imported",
      entityType: "project",
      entityId: projectId,
      metadata: {
        memories: result.memories,
        skills: result.skills,
        skipped: Object.values(result.skipped).reduce((a, b) => a + b, 0),
      },
    });
  });
  return result;
}
