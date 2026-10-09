"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  convertRequestAction,
  updateRequestAction,
} from "@/app/[locale]/(app)/project/[slug]/requests/actions";
import { useRun } from "@/components/platform/use-run";
import { Button, buttonVariants } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/ui/form";
import { Link, useRouter } from "@/i18n/navigation";
import {
  MAINTENANCE_CLASSES,
  type MaintenanceClass,
  REQUEST_STATUSES,
  type RequestKind,
  type RequestStatus,
  type ScopeStatus,
} from "@/lib/domain/business";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Chip, SCOPE_TONE } from "./chip";
import { EngagementError } from "./engagement-error";

export interface RequestView {
  id: string;
  kind: RequestKind;
  side: "client" | "team";
  title: string;
  body: string;
  status: RequestStatus;
  scopeStatus: ScopeStatus;
  classification: MaintenanceClass;
  suggestedClassification: MaintenanceClass | null;
  changeRequestId: string | null;
  createdAt: string;
}

const OPEN: RequestStatus[] = ["open", "in_review"];
const STATUS_TONE = {
  open: "info",
  in_review: "warning",
  resolved: "success",
  declined: "neutral",
  converted: "neutral",
} as const;

/** The team's inbox of client requests: triage status, who pays, and conversion to a CR. */
export function RequestsInbox({
  slug,
  requests,
  canWrite,
  canConvert,
}: {
  slug: string;
  requests: RequestView[];
  canWrite: boolean;
  canConvert: boolean;
}) {
  const t = useTranslations("engagement.requests");
  const scope = useTranslations("engagement.scope");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const { pending, error, run } = useRun();
  const shown = filter === "open" ? requests.filter((r) => OPEN.includes(r.status)) : requests;
  const update = (r: RequestView, input: Record<string, string>) =>
    run(() => updateRequestAction(slug, r.id, input));

  return (
    <section aria-labelledby={`${id}-list`}>
      <h2 id={`${id}-list`} className="sr-only">
        {t("title")}
      </h2>
      <fieldset className="mb-4 flex items-center gap-2">
        <legend className="sr-only">{t("filterLabel")}</legend>
        <span aria-hidden="true" className="text-sm text-muted-foreground">
          {t("filterLabel")}
        </span>
        <div className="flex rounded-md border border-border p-0.5">
          {(["open", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className="min-h-9 rounded-sm px-3 text-sm text-muted-foreground aria-pressed:bg-surface-raised aria-pressed:text-foreground"
            >
              {f === "open" ? t("filterOpen") : t("filterAll")}
            </button>
          ))}
        </div>
      </fieldset>
      <EngagementError error={error} />
      {shown.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border-strong px-6 py-8 text-center text-sm text-muted-foreground">
          {requests.length === 0 ? t("empty") : t("emptyOpen")}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((r) => {
            const outOfScope = r.scopeStatus === "out_of_scope";
            const classifiable = r.kind === "maintenance" || r.kind === "bug";
            const suggestion =
              classifiable &&
              r.classification === "unclassified" &&
              r.suggestedClassification &&
              r.suggestedClassification !== "unclassified"
                ? r.suggestedClassification
                : null;
            return (
              <li
                key={r.id}
                className={cn(
                  "rounded-lg border p-4",
                  outOfScope ? "border-error/50 bg-error/5" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="neutral">{t(`kinds.${r.kind}`)}</Chip>
                  <Chip tone={STATUS_TONE[r.status]}>{t(`statuses.${r.status}`)}</Chip>
                  <Chip tone={SCOPE_TONE[r.scopeStatus]}>{scope(r.scopeStatus)}</Chip>
                  <span className="text-xs text-subtle-foreground">
                    {r.side === "client" ? t("fromClient") : t("fromTeam")} ·{" "}
                    {formatRelative(new Date(r.createdAt), locale)}
                  </span>
                </div>
                <h3 className="mt-2 font-medium break-words">{r.title}</h3>
                {r.body ? (
                  <p className="mt-1 text-sm whitespace-pre-line break-words text-muted-foreground">
                    {r.body}
                  </p>
                ) : null}
                {outOfScope && !r.changeRequestId ? (
                  <p className="mt-2 text-sm text-error">{t("outOfScopeNote")}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  {canWrite && r.status !== "converted" ? (
                    <div>
                      <label htmlFor={`${id}-${r.id}-status`} className="mb-1 block text-xs">
                        {t("status")}
                      </label>
                      <select
                        id={`${id}-${r.id}-status`}
                        value={r.status}
                        disabled={pending}
                        onChange={(e) => update(r, { status: e.target.value })}
                        className={cn(FIELD_CLASS, "min-h-9 w-auto py-1 text-sm")}
                      >
                        {REQUEST_STATUSES.filter((s) => s !== "converted").map((s) => (
                          <option key={s} value={s}>
                            {t(`statuses.${s}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {classifiable ? (
                    canWrite ? (
                      <div>
                        <label htmlFor={`${id}-${r.id}-class`} className="mb-1 block text-xs">
                          {t("classification")}
                        </label>
                        <select
                          id={`${id}-${r.id}-class`}
                          value={r.classification}
                          disabled={pending}
                          onChange={(e) => update(r, { classification: e.target.value })}
                          className={cn(FIELD_CLASS, "min-h-9 w-auto py-1 text-sm")}
                        >
                          {MAINTENANCE_CLASSES.map((c) => (
                            <option key={c} value={c}>
                              {t(`classes.${c}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <span className="text-sm">
                        {t("classification")}: {t(`classes.${r.classification}`)}
                      </span>
                    )
                  ) : null}
                  {suggestion ? (
                    <span className="flex items-center gap-2 text-sm text-info">
                      {t("suggests", { class: t(`classes.${suggestion}`) })}
                      {canWrite ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => update(r, { classification: suggestion })}
                        >
                          {t("accept")}
                        </Button>
                      ) : null}
                    </span>
                  ) : null}
                  <span className="flex-1" />
                  {r.changeRequestId ? (
                    <Link
                      href={`/project/${slug}/changes`}
                      className={buttonVariants({ size: "sm", variant: "ghost" })}
                    >
                      {t("viewChange")}
                    </Link>
                  ) : canConvert && OPEN.includes(r.status) ? (
                    <Button
                      size="sm"
                      variant={outOfScope ? "primary" : "outline"}
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            convertRequestAction(slug, {
                              requestId: r.id,
                              title: r.title,
                              description: r.body,
                            }),
                          () => router.push(`/project/${slug}/changes`),
                        )
                      }
                    >
                      {t("convert")}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
