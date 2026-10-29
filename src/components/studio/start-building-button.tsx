"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { startBuildingAction } from "@/app/[locale]/(app)/project/[slug]/studio/actions";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

/**
 * "Start building" on an approved or signed document: hands the open tasks to Saqina's agents
 * when the project is built in Saqina, then opens the Studio. Elsewhere it only opens the Studio.
 */
export function StartBuildingButton({ slug, size }: { slug: string; size?: "sm" }) {
  const t = useTranslations("studio.start");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size={size}
      disabled={pending}
      onClick={() =>
        start(async () => {
          // A failed hand-out still opens the Studio: the chat there can start the work instead.
          await startBuildingAction(slug);
          router.push(`/project/${slug}/studio`);
        })
      }
    >
      {pending ? t("starting") : t("button")}
    </Button>
  );
}
