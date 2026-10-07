"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { EngineCopy } from "@/lib/interview/copy";
import type { PreviewList, ProjectPreview } from "@/lib/interview/types";
import { cn } from "@/lib/utils";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-border py-3.5">
      <dt className="font-mono text-xs text-subtle-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function List({ list, empty, suggested }: { list: PreviewList; empty: string; suggested: string }) {
  if (list.items.length === 0) return <span className="text-subtle-foreground">{empty}</span>;
  return (
    <span className={cn(list.suggested && "text-muted-foreground")}>
      {list.items.join(" · ")}
      {list.suggested ? (
        <span className="ml-2 font-mono text-xs text-info">{suggested}</span>
      ) : null}
    </span>
  );
}

/**
 * Live picture of the project, rebuilt from the answers on every change. Engine guesses are
 * marked "suggested" until the user confirms them in the interview.
 */
export function ProjectStage({ preview, copy }: { preview: ProjectPreview; copy: EngineCopy }) {
  const t = useTranslations("interview");
  const muted = (text: string) => <span className="text-subtle-foreground">{text}</span>;
  return (
    <section
      aria-label={t("stage.label")}
      className="rounded-lg border border-border bg-surface p-5"
    >
      <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
        {t("stage.project")}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight">
        {preview.label ?? muted(t("stage.waiting"))}
      </p>
      <dl className="mt-4">
        <Row label={t("stage.users")}>
          <List list={preview.users} empty={t("stage.notKnown")} suggested={t("stage.suggested")} />
        </Row>
        <Row label={t("stage.core")}>
          <List list={preview.core} empty={t("stage.notKnown")} suggested={t("stage.suggested")} />
        </Row>
        <Row label={t("stage.complexity")}>
          {preview.complexity
            ? copy.complexity.names[preview.complexity]
            : muted(t("stage.afterFeatures"))}
        </Row>
        <Row label={t("stage.build")}>
          {preview.build
            ? preview.build === "saqina"
              ? t("steps.buildSaqina")
              : t("steps.buildAgent")
            : muted(t("stage.notDecided"))}
        </Row>
        {preview.stack.length ? (
          <Row label={t("stage.stack")}>{preview.stack.join(" · ")}</Row>
        ) : null}
        {preview.landing ? (
          <Row label={t("stage.landing")}>
            {copy.concepts[preview.landing.primary].name}
            {preview.landing.supporting.length ? (
              <span className="text-muted-foreground">
                {" "}
                + {preview.landing.supporting.map((id) => copy.concepts[id].name).join(" + ")}
              </span>
            ) : null}
          </Row>
        ) : null}
      </dl>
      <p className="mt-4 border-t border-border pt-3 text-xs text-subtle-foreground">
        {t("stage.localEngine")}
      </p>
    </section>
  );
}
