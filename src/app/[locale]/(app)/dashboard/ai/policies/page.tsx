import { PolicyForm } from "@/components/platform/policy-form";
import { getPolicy, listModels, listProviders } from "@/lib/ai/control-plane";
import { requireActorPage } from "@/lib/auth/server";
import { listPlatformOwners } from "@/lib/platform/roles";

export default async function PoliciesPage() {
  const actor = await requireActorPage("/dashboard/ai/policies");
  const [policy, providers, { models }, owners] = await Promise.all([
    getPolicy(actor),
    listProviders(actor),
    listModels(actor),
    listPlatformOwners(),
  ]);
  return (
    <PolicyForm
      policy={policy}
      providers={providers.map((p) => ({ id: p.id, name: p.name }))}
      models={models.map((m) => ({ id: m.id, label: `${m.providerName} / ${m.displayName}` }))}
      owners={owners}
      bootstrap={owners.length === 0}
    />
  );
}
