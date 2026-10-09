"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { generateBusinessDocumentAction } from "@/app/[locale]/(app)/project/[slug]/documents/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { EngagementError } from "./engagement-error";

const KINDS = ["proposal", "agreement", "handover", "maintenance_agreement"] as const;

/** Drafts a business document from the project records, then opens it. */
export function BusinessDocs({ slug }: { slug: string }) {
  const t = useTranslations("engagement.businessDocs");
  const id = useId();
  const router = useRouter();
  const { pending, error, run } = useRun();

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="mb-6 rounded-lg border border-border p-4 sm:p-5"
    >
      <h2 id={`${id}-title`} className="font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("note")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {KINDS.map((kind) => (
          <Button
            key={kind}
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              run<{ slug: string }>(
                () => generateBusinessDocumentAction(slug, kind),
                (doc) => router.push(`/project/${slug}/documents/${doc.slug}`),
              )
            }
          >
            {t(`kinds.${kind}`)}
          </Button>
        ))}
      </div>
      <EngagementError error={error} />
    </section>
  );
}
