"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import type { InterviewEngine } from "@/lib/interview/engine";
import type { Recommendation, StepId } from "@/lib/interview/types";
import { cn } from "@/lib/utils";
import { ConceptSummary } from "./concept-picker";

interface RowProps {
  label: string;
  children: ReactNode;
  /** Step to jump to when editing; omitted when the step is not part of this interview. */
  editStep?: StepId;
  onEdit: (step: StepId) => void;
  source?: "chosen" | "recommended";
  sourceLabel?: string;
  editLabel: string;
}

function Row({ label, children, editStep, onEdit, source, sourceLabel, editLabel }: RowProps) {
  return (
    <div className="grid gap-2 border-b border-border py-5 sm:grid-cols-[11rem_1fr_auto] sm:gap-6">
      <dt className="text-sm text-muted-foreground">
        {label}
        {source ? (
          <span
            className={cn(
              "mt-1 block font-mono text-xs",
              source === "recommended" ? "text-primary" : "text-subtle-foreground",
            )}
          >
            {sourceLabel}
          </span>
        ) : null}
      </dt>
      <dd className="min-w-0">{children}</dd>
      {editStep ? (
        <dd className="sm:text-right">
          <Button size="sm" variant="ghost" onClick={() => onEdit(editStep)}>
            {editLabel}
            <span className="sr-only"> {label}</span>
          </Button>
        </dd>
      ) : null}
    </div>
  );
}

const Reason = ({ children }: { children: ReactNode }) => (
  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
);

type CopyState = "idle" | "copied" | "failed";

interface RecommendationSummaryProps {
  rec: Recommendation;
  engine: InterviewEngine;
  visibleSteps: StepId[];
  accepted: boolean;
  onEdit: (step: StepId) => void;
  onAccept: () => void;
  onStartOver: () => void;
}

export function RecommendationSummary({
  rec,
  engine,
  visibleSteps,
  accepted,
  onEdit,
  onAccept,
  onStartOver,
}: RecommendationSummaryProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [continued, setContinued] = useState(false);
  const [copyState, setCopy] = useState<CopyState>("idle");
  const t = useTranslations("interview.summary");
  const featureLabel = (f: Recommendation["features"]["selected"][number]) =>
    engine.copy.options.feature[f].label;
  // Shared props for every row: translated source tag and edit button text.
  const rowProps = (chosen?: boolean) => ({
    onEdit,
    editLabel: t("edit"),
    ...(chosen === undefined
      ? {}
      : { source: source(chosen), sourceLabel: chosen ? t("chosen") : t("recommended") }),
  });
  const edit = (step: StepId) => (visibleSteps.includes(step) ? step : undefined);
  const source = (chosen: boolean) => (chosen ? ("chosen" as const) : ("recommended" as const));

  const markdown = () => engine.brief(rec);

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(markdown());
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  const downloadBrief = () => {
    const url = URL.createObjectURL(new Blob([markdown()], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${rec.slug}-brief.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-10">
      <div>
        <p className="font-mono text-xs text-subtle-foreground">{t("projectEyebrow")}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{rec.projectLabel}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("complexity")}{" "}
          <span className="text-foreground">
            {engine.copy.complexity.names[rec.complexity.level]}
          </span>
          . {rec.complexity.reason}
        </p>
      </div>

      <dl className="border-t border-border">
        <Row label={t("project")} editStep={edit("project")} {...rowProps()}>
          {rec.projectLabel}
          <Reason>{rec.projectState}</Reason>
        </Row>
        <Row label={t("audience")} editStep={edit("audience")} {...rowProps()}>
          {rec.audience.join(", ") || t("notSpecified")}
        </Row>
        <Row label={t("objective")} editStep={edit("objective")} {...rowProps()}>
          {rec.objective || t("notSpecified")}
        </Row>
        <Row label={t("features")} editStep={edit("features")} {...rowProps()}>
          {rec.features.selected.length
            ? rec.features.selected.map(featureLabel).join(", ")
            : t("noFeatures")}
          {rec.features.suggested.length ? (
            <Reason>
              {t("suggestedFeatures")} {rec.features.suggested.map(featureLabel).join(", ")}
            </Reason>
          ) : null}
        </Row>
        <Row
          label={t("development")}
          editStep={edit("development")}
          {...rowProps(rec.development.chosen)}
        >
          {engine.copy.options.developmentMode[rec.development.value].label}
          <Reason>{rec.development.reason}</Reason>
        </Row>
        {rec.agent ? (
          <Row label={t("agent")} editStep={edit("agent")} {...rowProps(rec.agent.chosen)}>
            {rec.agent.value}
            <Reason>{rec.agent.reason}</Reason>
          </Row>
        ) : null}
        <Row label={t("stack")} editStep={edit("technology")} {...rowProps(rec.stack.chosen)}>
          <ul className="space-y-0.5">
            {rec.stack.value.map((s) => (
              <li key={s.layer}>
                <span className="text-muted-foreground">{s.layer}:</span> {s.value}
              </li>
            ))}
          </ul>
          <Reason>{rec.stack.reason}</Reason>
        </Row>
        <Row label={t("database")} editStep={edit("database")} {...rowProps(rec.database.chosen)}>
          {rec.database.value}
          <Reason>{rec.database.reason}</Reason>
        </Row>
        <Row
          label={t("deployment")}
          editStep={edit("deployment")}
          {...rowProps(rec.deployment.chosen)}
        >
          {rec.deployment.value}
          <Reason>{rec.deployment.steps.join(" › ")}</Reason>
        </Row>
        {rec.versioning ? (
          <Row
            label={t("versioning")}
            editStep={edit("versioning")}
            {...rowProps(rec.versioning.chosen)}
          >
            {rec.versioning.value ? t("semver") : t("noSemver")}
            <Reason>{rec.versioning.reason}</Reason>
          </Row>
        ) : null}
        <Row
          label={t("landing")}
          editStep={edit("landing")}
          {...rowProps(rec.landing ? rec.landing.overridden : undefined)}
        >
          {rec.landing ? (
            <ConceptSummary landing={rec.landing} copy={engine.copy} />
          ) : (
            t("noLanding")
          )}
        </Row>
        <Row label={t("integrations")} {...rowProps()}>
          {rec.futureIntegrations.join(", ")}
        </Row>
      </dl>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button onClick={() => setContinued(true)}>{t("continue")}</Button>
        <Button variant="outline" onClick={onAccept} disabled={accepted}>
          {accepted ? t("accepted") : t("accept")}
        </Button>
        <Button variant="ghost" onClick={() => setConfirmReset(true)}>
          {t("startOver")}
        </Button>
      </div>

      {confirmReset ? (
        <fieldset className="rounded-md border border-error/50 bg-surface p-5">
          {/* Floated legend sits inside the box instead of on its border. */}
          <legend className="float-left w-full font-medium">{t("resetTitle")}</legend>
          <div className="clear-both flex flex-col gap-2 pt-4 sm:flex-row">
            <Button variant="danger" size="sm" onClick={onStartOver}>
              {t("resetConfirm")}
            </Button>
            <Button variant="ghost" size="sm" autoFocus onClick={() => setConfirmReset(false)}>
              {t("resetCancel")}
            </Button>
          </div>
        </fieldset>
      ) : null}

      {continued ? (
        <section
          aria-labelledby="continue-title"
          className="rounded-md border border-primary/50 bg-surface p-5 sm:p-6"
        >
          <h2 id="continue-title" className="text-lg font-medium">
            {t("phase2Title")}
          </h2>
          <p className="mt-1 font-mono text-xs text-primary">{t("phase2Prepared")}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("phase2Body")}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button size="sm" onClick={copyBrief}>
              {t("copy")}
            </Button>
            <Button size="sm" variant="outline" onClick={downloadBrief}>
              {t("download", { file: `${rec.slug}-brief.md` })}
            </Button>
          </div>
          <p aria-live="polite" className="mt-3 text-sm">
            {copyState === "copied" ? <span className="text-primary">{t("copied")}</span> : null}
            {copyState === "failed" ? <span className="text-error">{t("copyFailed")}</span> : null}
          </p>
        </section>
      ) : null}
    </div>
  );
}
