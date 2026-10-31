import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { aiModels, aiProviders, platformAiSettings } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { requirePlatformOwner } from "@/lib/platform/roles";
import { parse } from "@/lib/validation";
import { platformSettings } from "../catalog";
import { CLI_DEFINITIONS, CLI_IDS } from "./definitions";
import { type CliStatus, cliEnabled, detectClis } from "./run";

/**
 * The Owner's view of the local CLIs on the server and the one action that matters: connect one
 * as an AI provider. Everything else (test, switch off, disconnect) is the ordinary provider
 * management. Every call needs the platform Owner; every change is audited.
 */

export interface CliProviderView extends CliStatus {
  /** The provider created for this CLI, once connected. */
  providerId: string | null;
  providerStatus: string | null;
  providerEnabled: boolean;
}

export interface CliOverview {
  /** The Owner's switch. Off until they turn it on. */
  enabled: boolean;
  clis: CliProviderView[];
}

const cliRows = () =>
  db
    .select({
      id: aiProviders.id,
      status: aiProviders.status,
      enabled: aiProviders.enabled,
      cli: sql<string | null>`${aiProviders.configuration}->>'cli'`,
    })
    .from(aiProviders)
    .where(and(eq(aiProviders.adapter, "local_cli"), isNull(aiProviders.ownerUserId)));

/**
 * The Owner's switch for local CLIs. Off by default. Turning it off stops every CLI provider at the
 * next call (they fail and the gateway moves on), without deleting anything.
 */
export async function setCliEnabled(actor: Actor, input: unknown): Promise<{ enabled: boolean }> {
  await requirePlatformOwner(actor);
  const { enabled } = parse(z.object({ enabled: z.boolean() }), input);
  await db.transaction(async (tx) => {
    await platformSettings(tx);
    await tx
      .update(platformAiSettings)
      .set({ localCliEnabled: enabled, updatedBy: actor.id, updatedAt: new Date() })
      .where(eq(platformAiSettings.id, 1));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: enabled ? "provider.cli_enabled" : "provider.cli_disabled",
      entityType: "platform_ai_settings",
      entityId: "1",
      metadata: {},
    });
  });
  return { enabled };
}

export async function listClis(
  actor: Actor,
  options: { searchPath?: string } = {},
): Promise<CliOverview> {
  await requirePlatformOwner(actor);
  const enabled = await cliEnabled();
  const [found, rows] = await Promise.all([
    enabled ? detectClis(options.searchPath) : Promise.resolve(undefined),
    cliRows(),
  ]);
  return {
    enabled,
    clis: CLI_IDS.map((id) => {
      const def = CLI_DEFINITIONS[id];
      const status = found?.find((c) => c.id === id) ?? {
        id,
        name: def.name,
        installed: false,
        version: null,
        loginHint: def.loginHint,
        models: def.models,
      };
      const row = rows.find((r) => r.cli === id);
      return {
        ...status,
        providerId: row?.id ?? null,
        providerStatus: row?.status ?? null,
        providerEnabled: row?.enabled ?? false,
      };
    }),
  };
}

/**
 * Connects a CLI as a provider, with its models. Connecting again after a disconnect switches the
 * same provider back on. The CLI must be installed on this server and local CLIs must be on.
 */
export async function connectCli(
  actor: Actor,
  input: unknown,
  options: { searchPath?: string } = {},
): Promise<{ id: string }> {
  await requirePlatformOwner(actor);
  const { cli } = parse(z.object({ cli: z.enum(CLI_IDS) }), input);
  if (!(await cliEnabled()))
    throw new AppError("VALIDATION_ERROR", "Local CLI is off", { cli: "cliOff" });
  const status = (await detectClis(options.searchPath)).find((c) => c.id === cli);
  if (!status?.installed)
    throw new AppError("VALIDATION_ERROR", "CLI not installed", { cli: "cliNotInstalled" });
  const def = CLI_DEFINITIONS[cli];
  return db.transaction(async (tx) => {
    const [existing] = (
      await tx
        .select({
          id: aiProviders.id,
          cli: sql<string | null>`${aiProviders.configuration}->>'cli'`,
        })
        .from(aiProviders)
        .where(and(eq(aiProviders.adapter, "local_cli"), isNull(aiProviders.ownerUserId)))
    ).filter((r) => r.cli === cli);
    let id = existing?.id;
    if (id) {
      await tx
        .update(aiProviders)
        .set({ enabled: true, status: "untested" })
        .where(eq(aiProviders.id, id));
    } else {
      const [row] = await tx
        .insert(aiProviders)
        .values({
          slug: `cli-${cli}`,
          name: `${def.name} (local CLI)`,
          type: "custom",
          adapter: "local_cli",
          configuration: { cli },
          status: "untested",
        })
        .onConflictDoNothing()
        .returning({ id: aiProviders.id });
      if (!row) throw new AppError("CONFLICT", "Already connected", { cli: "exists" });
      id = row.id;
      await tx.insert(aiModels).values(
        def.models.map((modelId) => ({
          providerId: id as string,
          modelId,
          displayName:
            modelId === "default" ? `${def.name}, CLI default` : `${def.name} ${modelId}`,
          capabilities: ["text", "structured_output"] as ("text" | "structured_output")[],
        })),
      );
    }
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "provider.cli_connected",
      entityType: "ai_provider",
      entityId: id,
      metadata: { cli },
    });
    return { id };
  });
}
