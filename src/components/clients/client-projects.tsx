import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export interface ClientProjectView {
  slug: string;
  name: string;
  portalEnabled: boolean;
}

export async function ClientProjects({ projects }: { projects: ClientProjectView[] }) {
  const t = await getTranslations("clients.detail");
  return (
    <section
      aria-labelledby="client-projects-heading"
      className="rounded-lg border border-border p-5"
    >
      <h2 id="client-projects-heading" className="font-medium">
        {t("projects")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("projectsHint")}</p>
      {projects.length === 0 ? (
        <p className="mt-4 text-sm text-subtle-foreground">{t("projectsEmpty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {projects.map((p) => (
            <li key={p.slug} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <Link
                href={`/project/${p.slug}`}
                className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
              >
                {p.name}
              </Link>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-xs",
                    p.portalEnabled
                      ? "border-success/40 text-success"
                      : "border-border text-subtle-foreground",
                  )}
                >
                  {p.portalEnabled ? t("portalOn") : t("portalOff")}
                </span>
                <Link
                  href={`/project/${p.slug}/settings`}
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {t("projectSettings")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
