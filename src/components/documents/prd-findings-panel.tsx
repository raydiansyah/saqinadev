"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  dismissPrdFindingsAction,
  proposePrdUpdateAction,
} from "@/app/[locale]/(app)/project/[slug]/prd/actions";
import { useRun } from "@/components/platform/use-run";
import { Button, buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";

export interface PrdFindingItem {
  id: string;
  kind: string;
  subject: string;
  /** Only requirements missing from the PRD can be turned into a proposal. */
  proposable: boolean;
  proposed: boolean;
}

/**
 * Where the PRD and the rest of the project disagree. Findings close by themselves when the
 * disagreement is gone. Nothing here edits the PRD: "Propose update" creates a proposal the
 * team approves like any other.
 */
export function PrdFindingsPanel({
  slug,
  findings,
  canWrite,
}: {
  slug: string;
  findings: PrdFindingItem[];
  canWrite: boolean;
}) {
  const t = useTranslations("documents.prdCheck");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState(false);
  const { pending, error, run } = useRun();
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  if (findings.length === 0) return null;
  const ids = [...picked];
  const canPropose =
    ids.length > 0 && ids.every((id) => findings.find((f) => f.id === id)?.proposable);

  return (
    <section
      aria-labelledby="prd-check-heading"
      className="mb-6 rounded-lg border border-warning/40 bg-surface p-4"
    >
      <h2 id="prd-check-heading" className="text-sm font-semibold">
        {t("title", { count: findings.length })}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("hint")}</p>
      <ul className="mt-3 space-y-2">
        {findings.map((f) => (
          <li key={f.id} className="flex gap-3 text-sm">
            {canWrite ? (
              <input
                type="checkbox"
                aria-label={t("select", { subject: f.subject })}
                checked={picked.has(f.id)}
                disabled={f.proposed}
                onChange={() => toggle(f.id)}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
            ) : null}
            <div className="min-w-0">
              <p className="break-words">
                <span className="text-muted-foreground">{t(`kinds.${f.kind}` as never)}: </span>
                {f.subject}
              </p>
              {f.proposed ? (
                <p className="text-xs text-subtle-foreground">{t("inProposal")}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {error ? (
        <Notice tone="error" className="mt-3">
          {t("failed")}
        </Notice>
      ) : null}
      {created && !error ? (
        <Notice tone="success" className="mt-3">
          {t("proposalCreated")}
        </Notice>
      ) : null}
      {canWrite ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending || !canPropose}
            onClick={() => {
              setCreated(false);
              run(
                () => proposePrdUpdateAction(slug, ids),
                () => {
                  setPicked(new Set());
                  setCreated(true);
                },
              );
            }}
          >
            {t("propose")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending || ids.length === 0}
            onClick={() =>
              run(
                () => dismissPrdFindingsAction(slug, ids),
                () => setPicked(new Set()),
              )
            }
          >
            {t("dismiss")}
          </Button>
          {created ? (
            <Link
              href={`/project/${slug}/approvals`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t("viewApprovals")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
