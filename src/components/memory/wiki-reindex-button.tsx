"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { reindexWikiAction } from "@/app/[locale]/(app)/project/[slug]/memory/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";

/** Asks for a fresh read of the documents. The work runs as a background job. */
export function WikiReindexButton({ slug }: { slug: string }) {
  const t = useTranslations("memoryHub.wiki");
  const errors = useTranslations("app.errors");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await reindexWikiAction(slug);
            setMessage(
              result.ok
                ? { tone: "success", text: t("reindexQueued") }
                : { tone: "error", text: errors(result.code) },
            );
          })
        }
      >
        {t("reindex")}
      </Button>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </div>
  );
}
