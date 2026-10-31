import { CliManager } from "@/components/platform/cli-manager";
import { ProviderManager } from "@/components/platform/provider-manager";
import { listClis } from "@/lib/ai/cli/service";
import { listProviders } from "@/lib/ai/control-plane";
import { requireActorPage } from "@/lib/auth/server";

export default async function ProvidersPage() {
  const actor = await requireActorPage("/dashboard/ai/providers");
  const [providers, cli] = await Promise.all([listProviders(actor), listClis(actor)]);
  return (
    <div className="space-y-10">
      <CliManager overview={cli} />
      <ProviderManager providers={providers} />
    </div>
  );
}
