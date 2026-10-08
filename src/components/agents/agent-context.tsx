import { getTranslations } from "next-intl/server";
import { ContextPackage } from "./context-package";
import { type ContextFileView, ContextViewer } from "./context-viewer";

/** What an agent would receive: the package outline and the serialised files themselves. */
export async function AgentContext({
  projectName,
  agentName,
  files,
  bundle,
}: {
  projectName: string;
  agentName: string;
  files: ContextFileView[];
  bundle: string;
}) {
  const t = await getTranslations("agents.context");
  return (
    <section aria-labelledby="agent-context-heading" className="mt-12">
      <h2 id="agent-context-heading" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 mb-5 max-w-2xl text-sm text-muted-foreground">
        {t("description", { agent: agentName })}
      </p>
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ContextPackage projectName={projectName} />
        <ContextViewer files={files} bundle={bundle} />
      </div>
    </section>
  );
}
