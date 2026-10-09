"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { logRequestAction } from "@/app/[locale]/(app)/project/[slug]/requests/actions";
import { Dialog } from "@/components/app/dialog";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Select, TextArea } from "@/components/ui/form";
import { REQUEST_KINDS } from "@/lib/domain/business";
import { EngagementError } from "./engagement-error";

/** Logs a request the client made outside the portal (phone, email, chat). */
export function LogRequestButton({ slug }: { slug: string }) {
  const t = useTranslations("engagement.requests");
  const common = useTranslations("engagement.common");
  const [open, setOpen] = useState(false);
  const id = useId();
  const { pending, error, run, clear } = useRun();
  const close = () => {
    clear();
    setOpen(false);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("log")}</Button>
      <Dialog open={open} onClose={close} title={t("logTitle")} description={t("logHint")}>
        <form
          className="space-y-4"
          action={(form) =>
            run(
              () =>
                logRequestAction(slug, {
                  kind: String(form.get("kind") ?? ""),
                  title: String(form.get("title") ?? ""),
                  body: String(form.get("body") ?? ""),
                }),
              close,
            )
          }
        >
          <Select id={`${id}-kind`} name="kind" label={t("kind")} defaultValue="feature">
            {REQUEST_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </Select>
          <Field
            id={`${id}-title`}
            name="title"
            label={t("requestTitle")}
            required
            minLength={3}
            maxLength={160}
          />
          <TextArea
            id={`${id}-body`}
            name="body"
            label={t("body")}
            placeholder={t("bodyPlaceholder")}
            rows={4}
            maxLength={4000}
          />
          <EngagementError error={error} />
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close}>
              {common("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {common("save")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
