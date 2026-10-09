"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { updateMilestoneClientAction } from "@/app/[locale]/(app)/project/[slug]/progress/actions";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export interface MilestoneView {
  id: string;
  title: string;
  clientTitle: string | null;
  clientVisible: boolean;
}

/** One row per milestone: visibility and the name the client sees. */
export function MilestoneEditor({
  slug,
  milestones,
}: {
  slug: string;
  milestones: MilestoneView[];
}) {
  const t = useTranslations("progress.editor");
  const id = useId();
  return (
    <section aria-labelledby={`${id}-editor`} className="rounded-lg border border-border p-5">
      <h2 id={`${id}-editor`} className="font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      <ul className="mt-4 divide-y divide-border">
        {milestones.map((m) => (
          <MilestoneRow key={m.id} slug={slug} milestone={m} />
        ))}
      </ul>
    </section>
  );
}

function MilestoneRow({ slug, milestone }: { slug: string; milestone: MilestoneView }) {
  const t = useTranslations("progress.editor");
  const id = useId();
  const { pending, error, run } = useRun();
  const [saved, setSaved] = useState(false);

  return (
    <li className="py-4">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onChange={() => setSaved(false)}
        action={(form) =>
          run(
            () =>
              updateMilestoneClientAction(slug, {
                id: milestone.id,
                clientTitle: String(form.get("clientTitle") ?? ""),
                clientVisible: form.get("clientVisible") === "on",
              }),
            () => setSaved(true),
          )
        }
      >
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("milestone")}</p>
          <p className="mt-1 text-sm font-medium break-words">{milestone.title}</p>
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
            <input
              type="checkbox"
              name="clientVisible"
              defaultChecked={milestone.clientVisible}
              className="size-4 accent-primary"
            />
            {t("visible")}
          </label>
        </div>
        <div>
          <label htmlFor={`${id}-title`} className="mb-1.5 block text-sm font-medium">
            {t("clientTitle")}
          </label>
          <input
            id={`${id}-title`}
            name="clientTitle"
            defaultValue={milestone.clientTitle ?? ""}
            placeholder={t("clientTitlePlaceholder")}
            maxLength={120}
            className={cn(FIELD_CLASS, "min-h-11 py-2.5")}
          />
        </div>
        <div className="flex items-center gap-2">
          <span aria-live="polite" className="text-xs text-success">
            {saved ? t("saved") : ""}
          </span>
          <Button type="submit" size="sm" disabled={pending}>
            {t("save")}
          </Button>
        </div>
      </form>
      <FormError error={error} />
    </li>
  );
}
