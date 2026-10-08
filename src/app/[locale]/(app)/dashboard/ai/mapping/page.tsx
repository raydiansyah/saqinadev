import { MappingForm } from "@/components/platform/mapping-form";
import { listModels, listRoleMappings } from "@/lib/ai/control-plane";
import { requireActorPage } from "@/lib/auth/server";

const ROLES = ["planner", "frontend", "backend", "qa", "docs", "general"] as const;

export default async function MappingPage() {
  const actor = await requireActorPage("/dashboard/ai/mapping");
  const [{ models }, mappings] = await Promise.all([listModels(actor), listRoleMappings(actor)]);
  const rows = ROLES.map((role) => {
    const m = mappings.find((x) => x.agentRole === role);
    return {
      role,
      primaryModelId: m?.primaryModelId ?? null,
      fallbackModelId: m?.fallbackModelId ?? null,
      requiredCapabilities: m?.requiredCapabilities ?? [],
    };
  });
  return <MappingForm rows={rows} models={models} />;
}
