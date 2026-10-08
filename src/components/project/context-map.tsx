import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export interface ContextNode {
  key: "requirements" | "prd" | "plan" | "tasks" | "memory" | "decisions";
  path: string;
  detail: string;
}

/**
 * PROJECT and its six context sources, each a link into the workspace. The Phase 1 system
 * map, now functional: it reflects real counts and opens the part you select.
 */
export async function ContextMap({
  projectName,
  nodes,
}: {
  projectName: string;
  nodes: ContextNode[];
}) {
  const t = await getTranslations("context");
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="font-mono text-xs text-subtle-foreground">{t("project")}</p>
      <p className="font-semibold">{projectName}</p>
      <ul className="mt-4 border-l border-border-strong pl-5">
        {nodes.map((node) => (
          <li key={node.key} className="relative">
            <span
              aria-hidden="true"
              className="absolute top-1/2 -left-5 h-px w-4 bg-border-strong"
            />
            <Link
              href={node.path}
              className="group flex min-h-11 items-center justify-between gap-3 rounded-md px-2 hover:bg-surface-raised"
            >
              <span className="font-medium group-hover:text-foreground">{t(node.key)}</span>
              <span className="font-mono text-xs text-muted-foreground">{node.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
