import { Section } from "@/components/primitives/section";
import type { SiteContent } from "@/content/site";

export function Features({ content }: { content: SiteContent["features"] }) {
  return (
    <Section id="features" file={content.file} title={content.title} intro={content.intro}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {content.items.map((item) => (
          <li key={item.id} data-reveal className="rounded-lg border border-border bg-surface p-6">
            <h3 className="text-lg font-semibold">{item.name}</h3>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {item.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Section>
  );
}
