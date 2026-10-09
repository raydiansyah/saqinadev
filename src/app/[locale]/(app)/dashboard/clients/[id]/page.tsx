import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { ArchiveToggle } from "@/components/clients/archive-toggle";
import { ClientForm, type ClientValues } from "@/components/clients/client-form";
import { ClientProjects } from "@/components/clients/client-projects";
import { type InvitationStatus, Invitations } from "@/components/clients/invitations";
import { PortalUsers } from "@/components/clients/portal-users";
import { orgPageAccess } from "@/components/finance/page-access";
import { Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { requireActorPage } from "@/lib/auth/server";
import { getClientDetail } from "@/lib/clients/service";
import { isAppError } from "@/lib/errors";
import { canOrg } from "@/lib/organizations/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("clients");
  return { title: t("metaTitle"), robots: { index: false } };
}

async function loadDetail(actor: Parameters<typeof getClientDetail>[0], id: string) {
  try {
    return await getClientDetail(actor, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

function invitationStatus(
  i: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: number,
): InvitationStatus {
  if (i.acceptedAt) return "accepted";
  if (i.revokedAt) return "revoked";
  return i.expiresAt.getTime() <= now ? "expired" : "pending";
}

export default async function ClientDetailPage({
  params,
}: PageProps<"/[locale]/dashboard/clients/[id]">) {
  const { id } = await params;
  const actor = await requireActorPage(`/dashboard/clients/${id}`);
  const { role } = await orgPageAccess(actor, "org:read");
  const canManage = canOrg(role, "clients:manage");
  const [detail, t] = await Promise.all([loadDetail(actor, id), getTranslations("clients.detail")]);
  const { client } = detail;
  const values: ClientValues = {
    name: client.name,
    company: client.company,
    email: client.email,
    phone: client.phone,
    address: client.address,
    internalNotes: client.internalNotes,
  };
  const now = Date.now();
  const invitations = detail.invitations
    .map((i) => ({
      id: i.id,
      email: i.email,
      status: invitationStatus(i, now),
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
    }))
    .reverse();

  return (
    <>
      <Link
        href="/dashboard/clients"
        className="mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-0"
      >
        {t("back")}
      </Link>
      <PageHeading
        title={client.name}
        description={client.company || undefined}
        actions={
          canManage ? (
            <ArchiveToggle clientId={client.id} status={client.status} values={values} />
          ) : undefined
        }
      />
      <div className="max-w-3xl space-y-6">
        {client.status === "archived" ? <Notice tone="info">{t("archivedNotice")}</Notice> : null}
        {canManage ? (
          <section
            aria-labelledby="client-details-heading"
            className="rounded-lg border border-border p-5"
          >
            <h2 id="client-details-heading" className="mb-4 font-medium">
              {t("details")}
            </h2>
            <ClientForm clientId={client.id} status={client.status} initial={values} />
          </section>
        ) : null}
        <ClientProjects projects={detail.projects} />
        <PortalUsers
          clientId={client.id}
          canManage={canManage}
          users={detail.portalUsers.map((u) => ({ ...u, since: u.since.toISOString() }))}
        />
        <Invitations clientId={client.id} canManage={canManage} invitations={invitations} />
      </div>
    </>
  );
}
