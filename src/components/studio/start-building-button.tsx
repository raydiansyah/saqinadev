"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { buildNowAction } from "@/app/[locale]/(app)/project/[slug]/studio/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";

/**
 * "Start building" on an approved or signed document. When the project is built in Saqina it
 * starts a real Build: the agents begin at once and the Studio opens on them, live. Where the
 * team builds elsewhere it only opens the Studio. A project that already has as many builds open
 * as it can run also opens the Studio, where the running one is.
 */
export function StartBuildingButton({ slug, size }: { slug: string; size?: "sm" }) {
  const t = useTranslations("studio.start");
  const te = useTranslations("studio.execution");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        size={size}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await buildNowAction(slug, t("request"));
            if (!result.ok && result.code !== "CONFLICT") {
              setError(result.code);
              return;
            }
            router.push(`/project/${slug}/studio`);
          })
        }
      >
        {pending ? t("starting") : t("button")}
      </Button>
      {error ? (
        <Notice tone="error" className="mt-2 w-full">
          {te.has(`startErrors.${error}` as never)
            ? te(`startErrors.${error}` as never)
            : t("failed")}
        </Notice>
      ) : null}
    </>
  );
}
