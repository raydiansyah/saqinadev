import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { ClientTable } from "@/components/clients/client-table";
import { NewClientButton } from "@/components/clients/new-client-button";
import { orgPageAccess } from "@/components/finance/page-access";
import { requireActorPage } from "@/lib/auth/server";
import { listClients } from "@/lib/clients/service";
import { canOrg } from "@/lib/organizations/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("clients");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function ClientsPage() {
  const actor = await requireActorPage("/dashboard/clients");
  const { role } = await orgPageAccess(actor, "org:read");
  const canManage = canOrg(role, "clients:manage");
  const [clients, t] = await Promise.all([listClients(actor), getTranslations("clients")]);

  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("description")}
        actions={canManage ? <NewClientButton /> : undefined}
      />
      {clients.length === 0 ? (
        <EmptyState title={t("empty.title")} body={t("empty.body")} />
      ) : (
        <ClientTable clients={clients} />
      )}
    </>
  );
}
