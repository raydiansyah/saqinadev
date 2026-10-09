"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { postMessageAction } from "@/app/[locale]/(portal)/portal/projects/[slug]/messages/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/form";
import { EngagementError } from "./error";

/** Composer under the thread. Clears on success; the page refresh shows the new message. */
export function MessageForm({ slug }: { slug: string }) {
  const t = useTranslations("portalEngagement.messages");
  const { pending, error, run } = useRun();
  const [body, setBody] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    run(
      () => postMessageAction(slug, { body }),
      () => setBody(""),
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <TextArea
        id="message-body"
        label={t("bodyLabel")}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
        maxLength={4000}
      />
      <EngagementError error={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !body.trim()} className="w-full sm:w-auto">
          {t("send")}
        </Button>
      </div>
    </form>
  );
}
