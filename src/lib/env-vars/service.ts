import "server-only";
import { and, asc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { type EnvVarFilled, projectEnvVars, projectServices } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";
import { revokeCredential, storeCredential, withSecret } from "@/lib/secrets/service";
import { parse } from "@/lib/validation";
import {
  ENVIRONMENTS,
  type Environment,
  type EnvVarValues,
  isPublicName,
  MAX_IMPORT,
  MAX_VALUE,
  nameProblem,
  parseDotenv,
} from "./rules";

/**
 * The environment variables a person sets on the project's app, like a hosting dashboard's list:
 * a name, a value per environment (production, preview, development), secret or not. Values are
 * write-only: sealed in one credential per variable, read only to be sent to the deployment or into
 * the developer's `.env.local`, never shown again and never put in a prompt. Names are not secret.
 */

export interface EnvVarView {
  id: string;
  name: string;
  secret: boolean;
  comment: string;
  source: "manual" | "import" | "repository";
  filled: EnvVarFilled;
  lastSyncedAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
}

/** A variable a service owns (its database or sign-in): shown in the list, changed on the service. */
export interface ServiceEnvView {
  name: string;
  secret: boolean;
  service: string;
  filled: EnvVarFilled;
}

export interface EnvState {
  vars: EnvVarView[];
  fromServices: ServiceEnvView[];
}

type Values = Record<Environment, string>;
const NO_VALUES: Values = { production: "", preview: "", development: "" };
const NOT_FILLED: EnvVarFilled = { production: false, preview: false, development: false };

const readValues = async (credentialId: string | null, projectId: string): Promise<Values> => {
  if (!credentialId) return NO_VALUES;
  try {
    return await withSecret(credentialId, { kind: "env", projectId }, async (secret) => ({
      ...NO_VALUES,
      ...(JSON.parse(secret) as Partial<Values>),
    }));
  } catch {
    return NO_VALUES;
  }
};

const filledOf = (v: Values): EnvVarFilled => ({
  production: Boolean(v.production),
  preview: Boolean(v.preview),
  development: Boolean(v.development),
});

const toView = (r: typeof projectEnvVars.$inferSelect): EnvVarView => ({
  id: r.id,
  name: r.name,
  secret: r.secret,
  comment: r.comment,
  source: r.source,
  filled: r.filled,
  lastSyncedAt: r.lastSyncedAt,
  lastError: r.lastError,
  updatedAt: r.updatedAt,
});

/** Names and what is filled, for any project member. Never a value. */
export async function getEnvState(access: ProjectAccess): Promise<EnvState> {
  const [rows, services] = await Promise.all([
    db
      .select()
      .from(projectEnvVars)
      .where(eq(projectEnvVars.projectId, access.project.id))
      .orderBy(asc(projectEnvVars.name)),
    db
      .select({ label: projectServices.label, vars: projectServices.vars })
      .from(projectServices)
      .where(eq(projectServices.projectId, access.project.id)),
  ]);
  return {
    vars: rows.map(toView),
    fromServices: services.flatMap((s) =>
      s.vars.map((v) => ({
        name: v.name,
        secret: v.secret,
        service: s.label,
        filled: {
          production: v.production,
          preview: v.preview,
          development: Boolean(v.development),
        },
      })),
    ),
  };
}

/** Every variable with its values, for the deployment and the developer's file. Server only. */
export async function loadEnvVarValues(projectId: string): Promise<EnvVarValues[]> {
  const rows = await db
    .select()
    .from(projectEnvVars)
    .where(eq(projectEnvVars.projectId, projectId))
    .orderBy(asc(projectEnvVars.name));
  return Promise.all(
    rows.map(async (r) => ({
      name: r.name,
      secret: r.secret,
      ...(await readValues(r.credentialId, projectId)),
    })),
  );
}

/** Names a service already owns: setting one here would fight with the service. */
const serviceNames = async (tx: Tx | typeof db, projectId: string) =>
  new Set(
    (
      await tx
        .select({ vars: projectServices.vars })
        .from(projectServices)
        .where(eq(projectServices.projectId, projectId))
    ).flatMap((r) => r.vars.map((v) => v.name)),
  );

const valueInput = z.string().max(MAX_VALUE);
const saveInput = z.object({
  name: z.string().trim().max(64),
  secret: z.boolean().optional(),
  comment: z.string().trim().max(200).optional(),
  /** A value sets it; an empty one keeps what is stored. */
  production: valueInput.optional(),
  preview: valueInput.optional(),
  development: valueInput.optional(),
  /** Environments whose value is removed. */
  clear: z.array(z.enum(ENVIRONMENTS)).max(3).default([]),
});

interface Change {
  name: string;
  secret?: boolean;
  comment?: string;
  values: Partial<Values>;
  clear: Environment[];
  source: "manual" | "import" | "repository";
}

/** Applies one change inside the caller's transaction. Returns what changed, for the audit. */
async function applyChange(
  tx: Tx,
  actor: Actor,
  projectId: string,
  owned: Set<string>,
  change: Change,
): Promise<{ id: string; created: boolean }> {
  const problem = nameProblem(change.name);
  if (problem) throw new AppError("VALIDATION_ERROR", "Bad name", { name: problem });
  if (owned.has(change.name))
    throw new AppError("VALIDATION_ERROR", "A service owns it", { name: "service" });
  const [current] = await tx
    .select()
    .from(projectEnvVars)
    .where(and(eq(projectEnvVars.projectId, projectId), eq(projectEnvVars.name, change.name)))
    .for("update");
  const stored = await readValues(current?.credentialId ?? null, projectId);
  const merged: Values = { ...stored };
  for (const env of ENVIRONMENTS) {
    const value = change.values[env];
    if (value) merged[env] = value;
  }
  for (const env of change.clear) merged[env] = "";
  const secret = isPublicName(change.name) ? false : (change.secret ?? current?.secret ?? true);
  const filled = filledOf(merged);

  const credentialId = Object.values(filled).some(Boolean)
    ? await storeCredential(tx, {
        scope: "project",
        kind: "env",
        label: `env:${change.name}`,
        secret: JSON.stringify(merged),
        projectId,
        createdBy: actor.id,
      })
    : null;
  if (current?.credentialId) await revokeCredential(tx, current.credentialId);

  const row = {
    projectId,
    name: change.name,
    secret,
    comment: change.comment ?? current?.comment ?? "",
    source: current?.source ?? change.source,
    filled,
    credentialId,
    lastError: null,
    createdBy: current?.createdBy ?? actor.id,
  };
  if (current) {
    await tx.update(projectEnvVars).set(row).where(eq(projectEnvVars.id, current.id));
    return { id: current.id, created: false };
  }
  const [made] = await tx
    .insert(projectEnvVars)
    .values(row)
    .onConflictDoNothing()
    .returning({ id: projectEnvVars.id });
  if (!made) throw new AppError("CONFLICT", "Variable exists", { name: "exists" });
  return { id: made.id, created: true };
}

async function audit(
  tx: Tx,
  actor: Actor,
  projectId: string,
  type: string,
  entityId: string,
  names: string[],
) {
  await recordAudit(tx, {
    actorId: actor.id,
    scope: "project",
    projectId,
    type,
    entityType: "project_env_var",
    entityId,
    // Names only, never a value.
    metadata: { names: names.join(",") },
  });
}

/** Adds or changes one variable. Project admins only. */
export async function saveEnvVar(actor: Actor, slug: string, raw: unknown) {
  const input = parse(saveInput, raw);
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  const projectId = access.project.id;
  if (!(await allow(`env:save:${actor.id}`, 60, 60 * 60_000))) throw new AppError("RATE_LIMIT");
  return db.transaction(async (tx) => {
    const result = await applyChange(tx, actor, projectId, await serviceNames(tx, projectId), {
      name: input.name,
      secret: input.secret,
      comment: input.comment,
      values: {
        production: input.production,
        preview: input.preview,
        development: input.development,
      },
      clear: input.clear,
      source: "manual",
    });
    await audit(tx, actor, projectId, result.created ? "env.created" : "env.updated", result.id, [
      input.name,
    ]);
    return { id: result.id };
  });
}

const importInput = z.object({
  text: z.string().max(100_000),
  /** Where the pasted values go. The names are created once. */
  environments: z.array(z.enum(ENVIRONMENTS)).min(1).max(3),
  /** Replace a value that is already set. Off: a variable that has a value there is left alone. */
  overwrite: z.boolean().default(false),
});

export interface ImportResult {
  added: string[];
  updated: string[];
  /** Left alone: it already had a value there and overwrite was off. */
  kept: string[];
  /** Names that cannot be used: reserved, or owned by a service. */
  skipped: string[];
  /** Lines that were not a variable: the line number and why. */
  invalid: Array<{ line: number; reason: string }>;
}

/** Reads pasted `.env` text and sets each variable in the chosen environments. */
export async function importEnv(actor: Actor, slug: string, raw: unknown): Promise<ImportResult> {
  const input = parse(importInput, raw);
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  const projectId = access.project.id;
  if (!(await allow(`env:import:${actor.id}`, 20, 60 * 60_000))) throw new AppError("RATE_LIMIT");
  const parsed = parseDotenv(input.text);
  if (parsed.entries.length > MAX_IMPORT)
    throw new AppError("VALIDATION_ERROR", "Too many variables", { text: "tooMany" });
  const result: ImportResult = {
    added: [],
    updated: [],
    kept: [],
    skipped: [],
    invalid: parsed.invalid,
  };
  await db.transaction(async (tx) => {
    const owned = await serviceNames(tx, projectId);
    const existing = new Map(
      (
        await tx
          .select({ name: projectEnvVars.name, filled: projectEnvVars.filled })
          .from(projectEnvVars)
          .where(eq(projectEnvVars.projectId, projectId))
      ).map((r) => [r.name, r.filled]),
    );
    for (const entry of parsed.entries) {
      if (owned.has(entry.name)) {
        result.skipped.push(entry.name);
        continue;
      }
      const filled = existing.get(entry.name);
      const targets = input.environments.filter(
        (e) => entry.value && (input.overwrite || !filled?.[e]),
      );
      if (filled && targets.length === 0) {
        result.kept.push(entry.name);
        continue;
      }
      await applyChange(tx, actor, projectId, owned, {
        name: entry.name,
        values: Object.fromEntries(targets.map((e) => [e, entry.value])),
        clear: [],
        source: "import",
      });
      (filled ? result.updated : result.added).push(entry.name);
    }
    if (result.added.length + result.updated.length > 0)
      await audit(tx, actor, projectId, "env.imported", projectId, [
        ...result.added,
        ...result.updated,
      ]);
  });
  return result;
}

const namesInput = z.object({ names: z.array(z.string().max(64)).min(1).max(MAX_IMPORT) });

/** Adds names with no value yet, for example those the repository's `.env.example` lists. */
export async function addEnvNames(actor: Actor, slug: string, raw: unknown) {
  const { names } = parse(namesInput, raw);
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  const projectId = access.project.id;
  if (!(await allow(`env:names:${actor.id}`, 20, 60 * 60_000))) throw new AppError("RATE_LIMIT");
  const added: string[] = [];
  await db.transaction(async (tx) => {
    const owned = await serviceNames(tx, projectId);
    const have = new Set(
      (
        await tx
          .select({ name: projectEnvVars.name })
          .from(projectEnvVars)
          .where(eq(projectEnvVars.projectId, projectId))
      ).map((r) => r.name),
    );
    for (const name of [...new Set(names)]) {
      if (have.has(name) || owned.has(name) || nameProblem(name)) continue;
      await applyChange(tx, actor, projectId, owned, {
        name,
        values: {},
        clear: [],
        source: "repository",
      });
      added.push(name);
    }
    if (added.length > 0) await audit(tx, actor, projectId, "env.names_added", projectId, added);
  });
  return { added };
}

/** Removes a variable and its values. Returns the name so the caller can remove it from the deployment too. */
export async function removeEnvVar(actor: Actor, slug: string, raw: unknown) {
  const { id } = parse(z.object({ id: z.uuid() }), raw);
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(projectEnvVars).where(eq(projectEnvVars.id, id));
    if (!row || row.projectId !== access.project.id) throw new AppError("NOT_FOUND");
    if (row.credentialId) await revokeCredential(tx, row.credentialId);
    await tx.delete(projectEnvVars).where(eq(projectEnvVars.id, id));
    await audit(tx, actor, access.project.id, "env.removed", id, [row.name]);
    return { name: row.name };
  });
}

export const recordEnvSynced = async (projectId: string, error: string | null) => {
  await db
    .update(projectEnvVars)
    .set({ lastSyncedAt: error ? undefined : new Date(), lastError: error })
    .where(eq(projectEnvVars.projectId, projectId));
};

/** The names of every variable the project's app is given: set by a person or by a service. */
export async function allEnvNames(projectId: string): Promise<string[]> {
  const [own, services] = await Promise.all([
    db
      .select({ name: projectEnvVars.name })
      .from(projectEnvVars)
      .where(eq(projectEnvVars.projectId, projectId)),
    db
      .select({ vars: projectServices.vars })
      .from(projectServices)
      .where(eq(projectServices.projectId, projectId)),
  ]);
  return [
    ...new Set([...own.map((r) => r.name), ...services.flatMap((s) => s.vars.map((v) => v.name))]),
  ];
}
