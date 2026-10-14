import { ServiceEditor } from "@/components/services-admin/service-editor";
import { requireActorPage } from "@/lib/auth/server";
import { listServiceOptions } from "@/lib/services/admin";

export default async function NewServicePage() {
  const actor = await requireActorPage("/dashboard/services/new");
  return <ServiceEditor options={await listServiceOptions(actor)} />;
}
