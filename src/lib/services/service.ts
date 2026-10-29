import "server-only";
import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { projectServices, type ServiceVarConfig } from "@/lib/db/schema";
import { SERVICE_KINDS, SERVICE_PROVIDERS, type ServiceProvider } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { getRepository, withRepo } from "@/lib/git/service";
import { allow } from "@/lib/rate-limit";
import { revokeCredential, storeCredential, withSecret } from "@/lib/secrets/service";
import { parse } from "@/lib/validation";
import {
  compareEnv,
  type EnvGap,
  parseEnvNames,
  renderEnvExample,
  renderEnvLocal,
} from "./env-files";
import { ENV_NAME, presetFor, valueFits } from "./presets";
import { previewIssues, type ReadinessIssue, type ServiceValues } from "./preview-ready";

/**
 * Databases and sign-in services of the project's own app (Neon, Supabase, Clerk, ...), always on
 * the user's own accounts. Values are write-only: they are sealed in one credential per service,
 * read only inside `withServiceValues`, and sent to the deployment, never to a person or a prompt.
 */

export interface ServiceView {
  id: string;
  kind: "database" | "auth";
  provider: ServiceProvider;
  label: string;
  vars: ServiceVarConfig[];
  status: "incomplete" | "ready";
  lastSyncedAt: Date | null;
}

export interface ServicesState {
  services: ServiceView[];
  /** Why the app cannot be previewed yet; empty when it can, or when no service is used. */
  issues: ReadinessIssue[];
  /** The repository's `.env.example` against what is set up here; null when unknown. */
  gap?: EnvGap | null;
}

type Values = {
  production: Record<string, string>;
  preview: Record<string, string>;
  development: Record<string, string>;
};

/** The three places an app runs: the published site, Saqina's preview, a developer's machine. */
export const SERVICE_ENVS = ["production", "preview", "development"] as const;

const NO_VALUES: Values = { production: {}, preview: {}, development: {} };

const readValues = async (credentialId: string | null, projectId: string): Promise<Values> => {
  if (!credentialId) return NO_VALUES;
  try {
    return await withSecret(credentialId, { kind: "service", projectId }, async (secret) => {
      const parsed = JSON.parse(secret) as Partial<Values>;
      return {
        production: parsed.production ?? {},
        preview: parsed.preview ?? {},
        development: parsed.development ?? {},
      };
    });
  } catch {
    return NO_VALUES;
  }
};

const toView = (r: typeof projectServices.$inferSelect): ServiceView => ({
  id: r.id,
  kind: r.kind,
  provider: r.provider,
  label: r.label,
  vars: r.vars,
  status: r.status,
  lastSyncedAt: r.lastSyncedAt,
});

/** Every service of the project with its values, for the readiness rule and the deployment. */
export async function loadServiceValues(projectId: string): Promise<ServiceValues[]> {
  const rows = await db
    .select()
    .from(projectServices)
    .where(eq(projectServices.projectId, projectId))
    .orderBy(asc(projectServices.createdAt));
  return Promise.all(
    rows.map(async (r) => ({
      provider: r.provider,
      label: r.label,
      vars: r.vars,
      ...(await readValues(r.credentialId, projectId)),
    })),
  );
}

/** What the Studio shows: names and what is filled, plus the issues. Never a value. */
export async function getServicesState(access: ProjectAccess): Promise<ServicesState> {
  const rows = await db
    .select()
    .from(projectServices)
    .where(eq(projectServices.projectId, access.project.id))
    .orderBy(asc(projectServices.createdAt));
  return {
    services: rows.map(toView),
    issues: previewIssues(await loadServiceValues(access.project.id)),
  };
}

const valuesInput = z.record(z.string().regex(ENV_NAME), z.string().trim().max(4000));
const saveInput = z.object({
  id: z.uuid().optional(),
  provider: z.enum(SERVICE_PROVIDERS),
  /** Only a custom service picks its kind and variable names. */
  kind: z.enum(SERVICE_KINDS).optional(),
  label: z.string().trim().min(1).max(40).optional(),
  customVars: z
    .array(z.object({ name: z.string().regex(ENV_NAME), secret: z.boolean().default(true) }))
    .max(12)
    .optional(),
  production: valuesInput.default({}),
  preview: valuesInput.default({}),
  development: valuesInput.default({}),
});

/** Adds a service, or updates one: an empty value keeps what is stored. */
export async function saveService(actor: Actor, slug: string, raw: unknown) {
  const input = parse(saveInput, raw);
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  const projectId = access.project.id;
  if (!(await allow(`services:save:${actor.id}`, 30, 60 * 60_000)))
    throw new AppError("RATE_LIMIT");

  const preset = presetFor(input.provider);
  const specs =
    input.provider === "custom"
      ? (input.customVars ?? []).map((v) => ({ ...v, check: undefined }))
      : (preset?.vars ?? []);
  if (specs.length === 0)
    throw new AppError("VALIDATION_ERROR", "Variables needed", { vars: "required" });
  const kind = preset?.kind ?? input.kind;
  if (!kind) throw new AppError("VALIDATION_ERROR", "Kind needed", { kind: "required" });
  const names = new Set(specs.map((s) => s.name));
  for (const env of SERVICE_ENVS)
    for (const [name, value] of Object.entries(input[env])) {
      if (!names.has(name))
        throw new AppError("VALIDATION_ERROR", "Unknown variable", {
          [`${env}.${name}`]: "unknown",
        });
      const spec = specs.find((s) => s.name === name);
      if (value && !valueFits(spec?.check, value))
        throw new AppError("VALIDATION_ERROR", "Value has the wrong shape", {
          [`${env}.${name}`]: "invalid",
        });
    }

  const [current] = input.id
    ? await db.select().from(projectServices).where(eq(projectServices.id, input.id))
    : [];
  if (input.id && (!current || current.projectId !== projectId)) throw new AppError("NOT_FOUND");
  const label = (input.label ?? current?.label ?? preset?.name ?? "Service").slice(0, 40);

  const stored = await readValues(current?.credentialId ?? null, projectId);
  const merged: Values = {
    production: { ...stored.production },
    preview: { ...stored.preview },
    development: { ...stored.development },
  };
  for (const env of SERVICE_ENVS)
    for (const [name, value] of Object.entries(input[env])) if (value) merged[env][name] = value;
  for (const env of SERVICE_ENVS)
    for (const name of Object.keys(merged[env])) if (!names.has(name)) delete merged[env][name];

  const vars: ServiceVarConfig[] = specs.map((s) => ({
    name: s.name,
    secret: s.secret,
    production: Boolean(merged.production[s.name]),
    preview: Boolean(merged.preview[s.name]),
    development: Boolean(merged.development[s.name]),
  }));
  const filled = vars.every((v) => v.production && v.preview);

  const id = await db.transaction(async (tx) => {
    const credentialId = await storeCredential(tx, {
      scope: "project",
      kind: "service",
      label: `service:${input.provider}:${label}`,
      secret: JSON.stringify(merged),
      projectId,
      createdBy: actor.id,
    });
    if (current?.credentialId) await revokeCredential(tx, current.credentialId);
    const values = {
      projectId,
      kind,
      provider: input.provider,
      label,
      credentialId,
      vars,
      status: filled ? ("ready" as const) : ("incomplete" as const),
      lastError: null,
      createdBy: actor.id,
    };
    let rowId: string;
    if (current) {
      await tx.update(projectServices).set(values).where(eq(projectServices.id, current.id));
      rowId = current.id;
    } else {
      const [row] = await tx
        .insert(projectServices)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: projectServices.id });
      if (!row) throw new AppError("CONFLICT", "Service exists", { label: "exists" });
      rowId = row.id;
    }
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId,
      type: current ? "service.updated" : "service.connected",
      entityType: "project_service",
      entityId: rowId,
      // Provider and variable names only; never a value.
      metadata: { provider: input.provider, vars: vars.map((v) => v.name).join(",") },
    });
    return rowId;
  });
  return { id };
}

export async function removeService(actor: Actor, slug: string, raw: unknown) {
  const { id } = parse(z.object({ id: z.uuid() }), raw);
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(projectServices).where(eq(projectServices.id, id));
    if (!row || row.projectId !== access.project.id) throw new AppError("NOT_FOUND");
    if (row.credentialId) await revokeCredential(tx, row.credentialId);
    await tx.delete(projectServices).where(eq(projectServices.id, id));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "service.removed",
      entityType: "project_service",
      entityId: id,
      metadata: { provider: row.provider },
    });
  });
}

/** The variables to set at the deployment: one entry per name and environment. */
export interface EnvVarForDeploy {
  key: string;
  value: string;
  secret: boolean;
  target: "production" | "preview" | "development";
}

/** The value a developer's machine uses: its own when set, otherwise the preview's. Never live. */
export const localValue = (s: ServiceValues, name: string): string | undefined =>
  s.development[name] || s.preview[name] || undefined;

export function envForDeploy(services: ServiceValues[]): EnvVarForDeploy[] {
  const out: EnvVarForDeploy[] = [];
  for (const s of services)
    for (const v of s.vars) {
      for (const target of ["production", "preview"] as const) {
        const value = s[target][v.name];
        if (value) out.push({ key: v.name, value, secret: v.secret, target });
      }
      // Vercel's development target feeds `vercel env pull` on the client's own Vercel.
      const local = localValue(s, v.name);
      if (local) out.push({ key: v.name, value: local, secret: v.secret, target: "development" });
    }
  return out;
}

export const recordServicesSynced = async (projectId: string, error: string | null) => {
  await db
    .update(projectServices)
    .set({ lastSyncedAt: error ? undefined : new Date(), lastError: error })
    .where(eq(projectServices.projectId, projectId));
};

/**
 * How the repository's `.env.example` compares with what is set up here, so work done in a local
 * IDE (a new variable) shows up in the Studio before the preview breaks. Null when there is no
 * repository or no `.env.example`; a host failure is treated the same, never as an error.
 */
export async function envSync(access: ProjectAccess): Promise<EnvGap | null> {
  try {
    const repo = await getRepository(access);
    if (!repo || repo.status === "disconnected") return null;
    const text = await withRepo(repo, (adapter, ref, token) =>
      adapter.readFile(ref, token, { path: ".env.example", ref: repo.defaultBranch }),
    );
    const rows = await db
      .select({ vars: projectServices.vars })
      .from(projectServices)
      .where(eq(projectServices.projectId, access.project.id));
    return compareEnv(
      parseEnvNames(text),
      rows.flatMap((r) => r.vars.map((v) => v.name)),
    );
  } catch {
    return null;
  }
}

/** The `.env.example` text (names only) for any project member. */
export async function envExampleFor(access: ProjectAccess): Promise<string> {
  const rows = await db
    .select()
    .from(projectServices)
    .where(eq(projectServices.projectId, access.project.id))
    .orderBy(asc(projectServices.createdAt));
  return renderEnvExample(rows);
}

/**
 * `.env.local` with real values for a developer's machine: project admins only, rate limited and
 * audited (names only). Values never include the live ones.
 */
export async function envLocalFor(actor: Actor, slug: string): Promise<string> {
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  if (!(await allow(`env-local:${actor.id}`, 20, 60 * 60_000))) throw new AppError("RATE_LIMIT");
  const services = await loadServiceValues(access.project.id);
  await recordAudit(db, {
    actorId: actor.id,
    scope: "project",
    projectId: access.project.id,
    type: "service.env_downloaded",
    entityType: "project",
    entityId: access.project.id,
    metadata: { vars: services.flatMap((s) => s.vars.map((v) => v.name)).join(",") },
  });
  return renderEnvLocal(services);
}
