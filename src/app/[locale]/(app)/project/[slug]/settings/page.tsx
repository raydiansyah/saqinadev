import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { AssistantSettingsForm } from "@/components/settings/assistant-settings-form";
import {
  DangerZone,
  GeneralForm,
  TechnicalForm,
} from "@/components/settings/project-settings-forms";
import { DEFAULT_MODEL, isModelEnabled } from "@/lib/ai/registry";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { projectPageAccess } from "@/lib/projects/page";
import { getSettings } from "@/lib/projects/repository";

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
        <TechnicalForm slug={slug} values={values} canEdit={canEdit} />
        {can(role, "project:delete") ? (
          <DangerZone slug={slug} name={project.name} archived={project.status === "archived"} />
        ) : null}
      </div>
    </>
  );
}
