"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  importResultAction,
  setHandoffStatusAction,
} from "@/app/[locale]/(app)/project/[slug]/integrations/actions";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/form";

/** Export (copy/download), status changes and result import for one handoff. */
export function HandoffActions({
  slug,
  handoffId,
  status,
  pkg,
  fileName,
  canWrite,
}: {
  slug: string;
  handoffId: string;
  status: string;
  pkg: string;
  fileName: string;
  canWrite: boolean;
}) {
  const t = useTranslations("integrations.handoff");
  const id = useId();
  const [copied, setCopied] = useState(false);
  const [raw, setRaw] = useState("");
  const { pending, error, run } = useRun();
  const closed = ["completed", "cancelled"].includes(status);

  const download = () => {
    const url = URL.createObjectURL(new Blob([pkg], { type: "text/markdown" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(pkg);
            setCopied(true);
          }}
        >
          {copied ? t("copied") : t("copy")}
        </Button>
        <Button size="sm" variant="outline" onClick={download}>
          {t("download")}
        </Button>
        {canWrite && !closed ? (
          <>
            {status === "generated" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(() => setHandoffStatusAction(slug, { handoffId, status: "sent" }))
                }
              >
                {t("markSent")}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() => setHandoffStatusAction(slug, { handoffId, status: "completed" }))
              }
            >
              {t("markCompleted")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(() => setHandoffStatusAction(slug, { handoffId, status: "cancelled" }))
              }
            >
              {t("cancel")}
            </Button>
          </>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {copied ? t("copied") : ""}
      </p>
      {canWrite && status !== "cancelled" ? (
        <form
          className="space-y-2"
          action={() =>
            run(
              () => importResultAction(slug, { handoffId, raw }),
              () => setRaw(""),
            )
          }
        >
          <TextArea
            id={`${id}-raw`}
            label={t("paste")}
            hint={t("pasteHint")}
            rows={5}
            maxLength={60_000}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <Button size="sm" type="submit" disabled={pending || !raw.trim()}>
            {t("import")}
          </Button>
        </form>
      ) : null}
      <FormError error={error} />
    </div>
  );
}
