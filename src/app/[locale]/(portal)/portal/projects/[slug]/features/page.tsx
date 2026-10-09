import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { SCOPE_CATEGORIES } from "@/lib/domain/business";
import { clientScope } from "@/lib/portal/views";
import { portalPageAccess } from "../../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.features");
  return { title: t("metaTitle") };
}

export default async function PortalFeaturesPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/features">) {
  const { slug } = await params;
  const items = await clientScope(await portalPageAccess(slug));
  const t = await getTranslations("portal.features");
  const groups = SCOPE_CATEGORIES.map((category) => ({
    category,
    items: items.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>
      {groups.length === 0 ? (
        <EmptyState title={t("title")} body={t("empty")} />
      ) : (
        groups.map((group) => (
          <section key={group.category} aria-labelledby={`scope-${group.category}`}>
            <h3 id={`scope-${group.category}`} className="font-medium">
              {t(`groups.${group.category}.title`)}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(`groups.${group.category}.body`)}
            </p>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
              {group.items.map((item, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: titles may repeat; order is fixed
                <li key={i} className="px-4 py-3">
                  <p className="break-words">{item.title}</p>
                  {item.description ? (
                    <p className="mt-1 text-sm break-words text-muted-foreground">
                      {item.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
