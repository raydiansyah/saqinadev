import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Notice } from "@/components/ui/form";
import { controlPlaneOverview } from "@/lib/ai/control-plane";
import { requireActorPage } from "@/lib/auth/server";
import { cryptoAvailable } from "@/lib/secrets/crypto";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Meaningful platform state only: what is connected and what answers by default. */
export default async function AiOverviewPage() {
  const actor = await requireActorPage("/dashboard/ai");
  const [data, t] = await Promise.all([
    controlPlaneOverview(actor),
    getTranslations("platform.overview"),
  ]);
  const stats = [
    [t("activeProviders"), `${data.activeProviders} / ${data.providers}`],
    [t("availableModels"), String(data.availableModels)],
    [
      t("defaultModel"),
      data.defaultModel
        ? `${data.defaultModel.providerName} / ${data.defaultModel.displayName}`
        : t("none"),
    ],
    [
      t("fallbackModel"),
      data.fallbackModel
        ? `${data.fallbackModel.providerName} / ${data.fallbackModel.displayName}`
        : t("none"),
    ],
    [t("connectedAgents"), String(data.connectedAgents)],
    [t("connectedMcp"), String(data.connectedMcp)],
    [t("gitConnections"), String(data.gitConnections)],
  ];
  return (
    <div className="space-y-6">
      {!cryptoAvailable() ? <Notice tone="warning">{t("encryptionMissing")}</Notice> : null}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 truncate font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="max-w-2xl text-sm text-muted-foreground">{t("systemFallback")}</p>
    </div>
  );
}
