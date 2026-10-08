import { ProviderManager } from "@/components/platform/provider-manager";
import { listProviders } from "@/lib/ai/control-plane";
import { requireActorPage } from "@/lib/auth/server";

export default async function ProvidersPage() {
  const actor = await requireActorPage("/dashboard/ai/providers");
  return <ProviderManager providers={await listProviders(actor)} />;
}
