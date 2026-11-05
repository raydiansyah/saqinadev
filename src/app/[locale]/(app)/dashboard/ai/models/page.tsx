import { ModelManager } from "@/components/platform/model-manager";
import { platformSettings } from "@/lib/ai/catalog";
import { listModels, listProviders } from "@/lib/ai/control-plane";
import { requireActorPage } from "@/lib/auth/server";

export default async function ModelsPage() {
  const actor = await requireActorPage("/dashboard/ai/models");
  // listModels checks the Owner role; the embedding id is read after it resolves.
  const [{ models, defaultModelId, fallbackModelId }, providers] = await Promise.all([
    listModels(actor),
    listProviders(actor),
  ]);
  const { embeddingModelId } = await platformSettings();
  return (
    <ModelManager
      models={models}
      providers={providers.map((p) => ({ id: p.id, name: p.name }))}
      defaultModelId={defaultModelId}
      fallbackModelId={fallbackModelId}
      embeddingModelId={embeddingModelId ?? null}
    />
  );
}
