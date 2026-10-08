import { getTranslations } from "next-intl/server";

const NODES = [
  { key: "requirements", file: "PROJECT.md" },
  { key: "prd", file: "PRD.md" },
  { key: "plan", file: "PLAN.md" },
  { key: "tasks", file: "TASKS.md" },
  { key: "memory", file: "MEMORY.md" },
  { key: "decisions", file: "DECISIONS.md" },
] as const;

/** The context package as a tree: PROJECT and the sources each file is built from. */
export async function ContextPackage({ projectName }: { projectName: string }) {
  const t = await getTranslations("context");
  const a = await getTranslations("agents.context");

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="text-sm font-medium text-muted-foreground">{a("package")}</h3>
      <p className="mt-3 font-mono text-sm">
        {t("project").toUpperCase()}
        <span className="sr-only">: </span>
        <span className="ml-2 font-sans text-muted-foreground">{projectName}</span>
      </p>
      <ul className="mt-1 font-mono text-sm">
        {NODES.map((node, i) => (
          <li key={node.key} className="flex min-h-8 items-center gap-2">
            <span aria-hidden="true" className="text-subtle-foreground">
              {i === NODES.length - 1 ? "└──" : "├──"}
            </span>
            <span className="font-sans">{t(node.key)}</span>
            <span className="ml-auto text-xs text-subtle-foreground">{node.file}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
