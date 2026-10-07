import { Container } from "@/components/primitives/container";
import type { SiteContent } from "@/content/site";

export function BeforeAfter({ content }: { content: SiteContent["beforeAfter"] }) {
  return (
    <section
      aria-labelledby="before-after-heading"
      className="border-t border-border py-20 sm:py-28"
    >
      <Container>
        <h2
          id="before-after-heading"
          className="max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          {content.title}
        </h2>
        <div className="mt-12 grid items-center gap-6 lg:grid-cols-[minmax(0,0.8fr)_auto_minmax(0,1.2fr)]">
          <figure data-reveal className="rounded-lg border border-dashed border-border-strong p-6">
            <figcaption className="font-mono text-xs text-subtle-foreground">
              {content.beforeLabel}
            </figcaption>
            <p className="mt-3 text-xl text-muted-foreground sm:text-2xl">{content.before}</p>
          </figure>
          <span aria-hidden="true" className="mx-auto h-8 w-px bg-border-strong lg:h-px lg:w-12" />
          <figure data-reveal className="rounded-lg border border-primary/50 bg-surface p-6">
            <figcaption className="font-mono text-xs text-primary">{content.afterLabel}</figcaption>
            <dl className="mt-3 divide-y divide-border">
              {content.after.map((row) => (
                <div
                  key={row.label}
                  className="grid gap-1 py-2.5 sm:grid-cols-[12rem_1fr] sm:gap-4"
                >
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="text-sm">{row.value}</dd>
                </div>
              ))}
            </dl>
          </figure>
        </div>
      </Container>
    </section>
  );
}
