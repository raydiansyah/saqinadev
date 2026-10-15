import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { ProjectClientForm } from "@/components/billing/project-client-form";
import { ProjectAiForm, TechStackForm } from "@/components/integrations/project-ai-forms";
import { AssistantSettingsForm } from "@/components/settings/assistant-settings-form";
import { McpServerPanel } from "@/components/settings/mcp-server-panel";
import {
  DangerZone,
  GeneralForm,
  TechnicalForm,
} from "@/components/settings/project-settings-forms";
import { listAgentRegistry } from "@/lib/agents/registry";
import { projectAiView } from "@/lib/ai/project-settings";
import { DEFAULT_MODEL, isModelEnabled } from "@/lib/ai/registry";
import { can } from "@/lib/auth/permissions";
import { listClientOptions } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import { invoices } from "@/lib/db/schema";
import { siteBase } from "@/lib/email/layout";
import { listAgentTokens } from "@/lib/mcp/tokens";
import { projectPageAccess } from "@/lib/projects/page";
import { getSettings } from "@/lib/projects/repository";
import { getTechStack } from "@/lib/projects/stack";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("project.settings");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function ProjectSettingsPage({
  params,
}: PageProps<"/[locale]/project/[slug]/settings">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const { project, actor, role } = access;
  const settings = await getSettings(db, project.id);
  const t = await getTranslations("project.settings");
  const canEdit = can(role, "project:update");
  // Client options come from the active organization; without one the section still renders.
  const [clientOptions, [invoiced]] = canEdit
    ? await Promise.all([
        listClientOptions(actor).catch(() => []),
        db
          .select({ id: invoices.id })
          .from(invoices)
          .where(eq(invoices.projectId, project.id))
          .limit(1),
      ])
    : [[], []];
  // Agent tokens are listed only for members who can manage the project.
  const [tokens, registry] = canEdit
    ? await Promise.all([listAgentTokens(actor, slug), listAgentRegistry(access)])
    : [[], { agents: [] as Awaited<ReturnType<typeof listAgentRegistry>>["agents"] }];
  const tokenRows = tokens.map((x) => ({
    id: x.id,
    label: x.label,
    prefix: x.prefix,
    agentName: x.agentName,
    scopes: x.scopes,
    expiresAt: x.expiresAt?.getTime() ?? null,
    revokedAt: x.revokedAt?.getTime() ?? null,
    lastUsedAt: x.lastUsedAt?.getTime() ?? null,
    createdAt: x.createdAt.getTime(),
  }));
  // External tools first, then the Saqina specialists.
  const agentOptions = [
    ...registry.agents.filter((a) => a.type !== "saqina"),
    ...registry.agents.filter((a) => a.type === "saqina"),
  ].map((a) => ({ id: a.id, name: a.name, team: a.type === "saqina" }));
  const values = {
    name: project.name,
    description: project.description,
    buildStrategy: project.buildStrategy ?? "saqina",
    repoProvider: settings?.repoProvider ?? "",
    repoUrl: settings?.repoUrl ?? "",
    defaultBranch: settings?.defaultBranch ?? "",
    deployProvider: settings?.deployProvider ?? "",
    environment: settings?.environment ?? "",
    domain: settings?.domain ?? "",
    aiProvider: settings?.aiProvider ?? "",
    aiModel: settings?.aiModel ?? "",
  };

  return (
    <>
      <PageHeading title={t("metaTitle")} />
      <div className="max-w-3xl space-y-6">
        <GeneralForm slug={slug} values={values} canEdit={canEdit} />
        {canEdit ? (
          <ProjectClientForm
            slug={slug}
            clients={clientOptions}
            values={{
              clientId: project.clientId,
              portalEnabled: project.portalEnabled,
              currency: project.currency,
            }}
            currencyLocked={Boolean(invoiced)}
          />
        ) : null}
        <section aria-labelledby="members-heading" className="rounded-lg border border-border p-5">
          <h2 id="members-heading" className="font-semibold">
            {t("members")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("membersHint")}</p>
          <ul className="mt-4">
            <li className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{actor.name}</span>
                <span className="block truncate text-sm text-muted-foreground">{actor.email}</span>
              </span>
              <span className="font-mono text-xs text-muted-foreground">{t(`roles.${role}`)}</span>
            </li>
          </ul>
        </section>
        <AssistantSettingsForm
          slug={slug}
          policy={settings?.approvalPolicy ?? "auto_low_risk"}
          model={isModelEnabled() ? process.env.AI_MODEL || DEFAULT_MODEL : null}
          canEdit={canEdit}
        />
        {canEdit ? (
          <McpServerPanel
            slug={slug}
            endpoint={`${siteBase()}/api/projects/${slug}/mcp`}
            agents={agentOptions}
            tokens={tokenRows}
          />
        ) : null}
        <ProjectAiForm slug={slug} view={await projectAiView(access)} canEdit={canEdit} />
        <TechStackForm
          slug={slug}
          stack={await getTechStack(access)}
          canEdit={can(role, "content:write")}
        />
        <TechnicalForm slug={slug} values={values} canEdit={canEdit} />
        {can(role, "project:delete") ? (
          <DangerZone slug={slug} name={project.name} archived={project.status === "archived"} />
        ) : null}
      </div>
    </>
  );
}
