import type { SiteContent } from "@/content/site";
import { PlannedTag } from "./stage-frame";

/** Infrastructure the project will connect to. Conceptual in Phase 1. */
interface InfraMapProps {
  content: SiteContent["infra"];
  planned: string;
}

export function InfraMap({ content, planned }: InfraMapProps) {
  const branches = [
    { name: "Vercel", ...content.vercel },
    { name: "Supabase", ...content.supabase },
  ];
  return (
    <figure
      aria-label={content.mapLabel}
      className="rounded-lg border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex items-center justify-between">
        <span className="rounded-md border border-border-strong px-4 py-2 font-medium">
          Saqina Dev
        </span>
        <PlannedTag label={planned} />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {branches.map((b) => (
          <div key={b.name} className="rounded-md border border-border p-4">
            <p className="font-medium">{b.name}</p>
            <p className="font-mono text-xs text-subtle-foreground">{b.role}</p>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {b.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mx-auto h-5 w-px bg-border-strong" />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/50 px-4 py-3">
        <span className="font-mono text-sm text-primary">project.saqina.dev</span>
        <span className="text-sm text-muted-foreground">{content.domainAlt}</span>
      </div>
    </figure>
  );
}
