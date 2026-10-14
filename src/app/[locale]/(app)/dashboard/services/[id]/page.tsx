import { notFound } from "next/navigation";
import { ServiceEditor } from "@/components/services-admin/service-editor";
import { requireActorPage } from "@/lib/auth/server";
import { isAppError } from "@/lib/errors";
import { getService, listServiceOptions } from "@/lib/services/admin";

export default async function EditServicePage({
  params,
}: PageProps<"/[locale]/dashboard/services/[id]">) {
  const { id } = await params;
  const actor = await requireActorPage(`/dashboard/services/${id}`);
  const [service, options] = await Promise.all([
    getService(actor, id).catch((error) => {
      if (isAppError(error) && error.code === "NOT_FOUND") notFound();
      throw error;
    }),
    listServiceOptions(actor),
  ]);
  return <ServiceEditor service={service} options={options} />;
}
