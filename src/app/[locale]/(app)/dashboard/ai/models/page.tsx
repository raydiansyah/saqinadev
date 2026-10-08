import { ModelManager } from "@/components/platform/model-manager";
import { listModels, listProviders } from "@/lib/ai/control-plane";
import { requireActorPage } from "@/lib/auth/server";

export default async function ModelsPage() {
  const actor = await requireActorPage("/dashboard/ai/models");
  const [{ models, defaultModelId, fallbackModelId }, providers] = await Promise.all([
    listModels(actor),
    listProviders(actor),
  ]);
  return (
    <ModelManager
      models={models}
      providers={providers.map((p) => ({ id: p.id, name: p.name }))}
      defaultModelId={defaultModelId}
      fallbackModelId={fallbackModelId}
    />
  );
}
