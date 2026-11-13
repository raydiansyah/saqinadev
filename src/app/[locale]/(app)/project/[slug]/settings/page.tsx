import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { ProjectClientForm } from "@/components/billing/project-client-form";
import { DangerZone, GeneralForm } from "@/components/settings/project-settings-forms";
import { can } from "@/lib/auth/permissions";
import { listClientOptions } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import { invoices } from "@/lib/db/schema";
import { projectPageAccess } from "@/lib/projects/page";

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
  const values = { name: project.name, description: project.description };

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
        {can(role, "project:delete") ? (
          <DangerZone slug={slug} name={project.name} archived={project.status === "archived"} />
        ) : null}
      </div>
    </>
  );
}
