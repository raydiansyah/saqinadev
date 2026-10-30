import { AgentDefinitionForm } from "@/components/platform/agent-definition-form";
import { AgentDefinitionList } from "@/components/platform/agent-definition-list";
import { definitionUsage, getDefinition, listDefinitions } from "@/lib/agent-definitions/service";
import { listModels } from "@/lib/ai/control-plane";
import { requireActorPage } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { listPlatformSkills } from "@/lib/skills/service";

export default async function AgentsPage({
  searchParams,
}: PageProps<"/[locale]/dashboard/ai/agents">) {
  const actor = await requireActorPage("/dashboard/ai/agents");
  const query = await searchParams;
  const edit = typeof query.edit === "string" ? query.edit : null;
  const creating = query.new === "1";
  const [definitions, { models }, usage, skills] = await Promise.all([
    listDefinitions(actor),
    listModels(actor),
    definitionUsage(actor),
    listPlatformSkills(actor),
  ]);
  const selected = edit
    ? await getDefinition(actor, edit).catch((e) =>
        e instanceof AppError ? null : Promise.reject(e),
      )
    : null;
  if (selected || creating)
    return (
      <AgentDefinitionForm
        key={selected?.definition.id ?? "new"}
        selected={selected}
        definitions={definitions.map((d) => ({ key: d.key, name: d.name }))}
        models={models}
        skills={skills.map(({ slug, name, description, source, enabled }) => ({
          slug,
          name,
          description,
          source,
          enabled,
        }))}
      />
    );
  return (
    <AgentDefinitionList
      definitions={definitions}
      usage={Object.fromEntries(
        Object.entries(usage).map(([id, u]) => [
          id,
          { ...u, lastRunAt: u.lastRunAt ? u.lastRunAt.toISOString() : null },
        ]),
      )}
    />
  );
}
