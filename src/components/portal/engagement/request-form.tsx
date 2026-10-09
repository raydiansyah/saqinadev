"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { createRequestAction } from "@/app/[locale]/(portal)/portal/projects/[slug]/requests/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Notice, TextArea } from "@/components/ui/form";
import { REQUEST_KINDS, type RequestKind } from "@/lib/domain/business";
import { EngagementError } from "./error";

/** New request: kind, short title and optional details. Explains what happens next. */
export function RequestForm({ slug, defaultKind }: { slug: string; defaultKind: RequestKind }) {
  const t = useTranslations("portalEngagement.requests");
  const { pending, error, run } = useRun();
  const [kind, setKind] = useState<RequestKind>(defaultKind);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(false);
    run(
      () => createRequestAction(slug, { kind, title, body }),
      () => {
        setTitle("");
        setBody("");
        setSent(true);
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-5 rounded-lg border border-border bg-surface p-5">
      <h3 className="font-medium">{t("formTitle")}</h3>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("kindLabel")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {REQUEST_KINDS.map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border-strong px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0 break-words">{t(`kinds.${value}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        id="request-title"
        label={t("titleLabel")}
        hint={t("titleHint")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        minLength={3}
        maxLength={160}
      />
      <TextArea
        id="request-body"
        label={t("bodyLabel")}
        hint={t("bodyHint")}
        rows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
      />
      <EngagementError error={error} />
      {sent ? (
        <Notice tone="success">
          <p className="font-medium">{t("sent")}</p>
          <p className="mt-1 text-muted-foreground">{t("afterSubmit")}</p>
        </Notice>
      ) : (
        <p className="text-sm text-muted-foreground">{t("afterSubmit")}</p>
      )}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {t("submit")}
      </Button>
    </form>
  );
}
