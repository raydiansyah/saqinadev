"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS, Notice } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/** The raw invitation link, shown exactly once right after it is created. */
export function InviteLink({
  url,
  email,
  emailed,
  onDone,
}: {
  url: string;
  email: string;
  emailed: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("clients.detail");
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 rounded-lg border border-primary/40 bg-surface p-4">
      <p className="font-medium">{t("inviteCreated")}</p>
      <Notice tone="warning" className="mt-3">
        {t("inviteOnce")}
      </Notice>
      <label htmlFor="invite-url" className="mt-3 mb-1.5 block text-sm font-medium">
        {t("inviteLink")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="invite-url"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(FIELD_CLASS, "min-h-11 min-w-0 flex-1 py-2 font-mono text-xs")}
        />
        <Button
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
        {emailed ? t("inviteEmailed", { email }) : t("inviteNotEmailed")}
      </p>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t("done")}
        </Button>
      </div>
    </div>
  );
}
