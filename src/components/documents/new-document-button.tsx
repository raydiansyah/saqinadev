"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { createDocumentAction } from "@/app/[locale]/(app)/project/[slug]/documents/actions";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";

export function NewDocumentButton({ slug }: { slug: string }) {
  const t = useTranslations("documents");
  const states = useTranslations("app.states");
  const errors = useTranslations("app.errors");
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {t("new")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("newTitle")}>
        <form
          action={(form) => {
            const title = String(form.get("title") ?? "").trim();
            if (title.length < 2) {
              setError(errors("VALIDATION_ERROR"));
              return;
            }
            startTransition(async () => {
              const result = await createDocumentAction(slug, title);
              if (!result.ok) {
                setError(errors(result.code));
                return;
              }
              setOpen(false);
              router.push(`/project/${slug}/documents/${result.data.slug}`);
            });
          }}
          className="space-y-4"
        >
          <Field
            id={`${id}-title`}
            name="title"
            label={t("newLabel")}
            maxLength={80}
            error={error}
            required
          />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {states("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("new")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
