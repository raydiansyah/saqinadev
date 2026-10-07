import type { SiteContent } from "@/content/site";

const ROWS: [string, string, "ok" | "wip"][] = [
  ["PRD", "✓", "ok"],
  ["PLAN", "✓", "ok"],
  ["TASKS", "7/12", "wip"],
  ["TESTS", "✓", "ok"],
  ["DEPLOY", "Preview", "wip"],
];

/** The single code-style element on the page: what a project looks like from a terminal. */
export function StatusTerminal({ content }: { content: SiteContent["infra"] }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-background">
      <figcaption className="border-b border-border px-4 py-2.5 text-sm text-muted-foreground">
        {content.terminalCaption}
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-6">
        <code>
          <span className="text-subtle-foreground">$</span> saqina project status{"\n\n"}
          <span className="text-muted-foreground">{content.terminalProject}</span> restaurant-pos
          {"\n"}
          <span className="text-muted-foreground">{content.terminalVersion}</span> 1.2.0{"\n\n"}
          {ROWS.map(([k, v, s]) => (
            <span key={k}>
              {k.padEnd(10)}
              <span className={s === "ok" ? "text-success" : "text-info"}>{v}</span>
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
