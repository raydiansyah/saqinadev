"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { InterviewEngine } from "@/lib/interview/engine";
import {
  AGENTS,
  AUDIENCES,
  type AudienceId,
  DATABASE_CHOICES,
  DATABASE_NEEDS,
  DEPLOYMENT_TARGETS,
  DEVELOPMENT_MODES,
  FEATURES,
  type FeatureId,
  PROJECT_STATES,
  PROJECT_TYPES,
  type ProjectTypeId,
  STACK_LAYERS,
  TECH_PREFERENCES,
  toOptions,
  VERSIONING_CHOICES,
} from "@/lib/interview/options";
import type { Answers, StepId } from "@/lib/interview/types";
import { ChoiceGroup } from "./choice-group";
import { ConceptPicker } from "./concept-picker";
import { TextAreaField, TextField } from "./fields";
import { Suggestion } from "./suggestion";

export interface StepProps {
  answers: Answers;
  engine: InterviewEngine;
  headingId: string;
  update: (patch: Partial<Answers>) => void;
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** Shows the engine's reasoning for a "not sure" answer before the user commits. */
function Recommended({ value, reason }: { value: string; reason: string }) {
  const t = useTranslations("interview.steps");
  return (
    <div aria-live="polite" className="rounded-md border border-primary/40 bg-surface px-4 py-3">
      <p className="text-sm">
        <span className="text-muted-foreground">{t("recommended")} </span>
        <span className="font-medium">{value}</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{reason}</p>
    </div>
  );
}

const QUICK_TYPES = [
  { key: "saas", type: "saas" },
  { key: "pos", type: "pos" },
  { key: "marketplace", type: "marketplace" },
  { key: "ai", type: "ai-application" },
  { key: "website", type: "company-profile" },
] as const satisfies readonly { key: string; type: ProjectTypeId }[];

function ProjectStep({ answers, engine, headingId, update }: StepProps) {
  const t = useTranslations("interview.steps");
  const typeLabel = (id: ProjectTypeId) => engine.copy.options.projectType[id].label;
  const detected = engine.classify(answers.projectDescription).projectType;
  return (
    <>
      <TextAreaField
        label={t("describeIdea")}
        placeholder={t("ideaPlaceholder")}
        value={answers.projectDescription}
        onChange={(projectDescription) => update({ projectDescription })}
        rows={3}
      />
      <div>
        <p className="mb-2 text-sm text-muted-foreground">{t("examples")}</p>
        <ul className="flex flex-wrap gap-2">
          {QUICK_TYPES.map((q) => (
            <li key={q.key}>
              <button
                type="button"
                aria-pressed={answers.projectType === q.type}
                onClick={() => update({ projectType: q.type, structure: undefined })}
                className="min-h-11 rounded-md border border-border px-4 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground aria-pressed:border-primary aria-pressed:text-foreground"
              >
                {t(`quick.${q.key}`)}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {detected && detected !== answers.projectType ? (
        <Suggestion
          text={t("soundsLike", { type: typeLabel(detected) })}
          actionLabel={t("useType", { type: typeLabel(detected) })}
          onAccept={() => update({ projectType: detected })}
        />
      ) : null}
      {/* The full list stays one click away instead of opening the interview as a grid. */}
      <details
        className="rounded-md border border-border"
        open={!!answers.projectType && !QUICK_TYPES.some((q) => q.type === answers.projectType)}
      >
        <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 text-sm">
          <span>
            <span className="text-muted-foreground">{t("projectType")} </span>
            {answers.projectType ? typeLabel(answers.projectType) : t("chooseAllTypes")}
          </span>
          <span aria-hidden="true" className="font-mono text-xs text-subtle-foreground">
            {t("allTypes")}
          </span>
        </summary>
        <div className="border-t border-border p-3">
          <ChoiceGroup
            name="projectType"
            labelledBy={headingId}
            columns={3}
            options={toOptions(PROJECT_TYPES, engine.copy.options.projectType)}
            value={answers.projectType}
            onChange={(projectType) => update({ projectType, structure: undefined })}
          />
        </div>
      </details>
    </>
  );
}

function AudienceStep({ answers, engine, headingId, update }: StepProps) {
  const t = useTranslations("interview.steps");
  const mentioned = engine
    .classify(`${answers.projectDescription} ${answers.objective}`)
    .audience.filter((a) => !answers.audience.includes(a));
  return (
    <>
      <ChoiceGroup<AudienceId>
        multiple
        name="audience"
        labelledBy={headingId}
        columns={3}
        options={toOptions(AUDIENCES, engine.copy.options.audience)}
        value={answers.audience}
        onChange={(audience) => update({ audience })}
      />
      {mentioned.length > 0 ? (
        <Suggestion
          text={t("mentionsAudience", {
            list: mentioned.map((a) => engine.copy.options.audience[a].label).join(", "),
          })}
          actionLabel={t("addThem")}
          onAccept={() => update({ audience: [...answers.audience, ...mentioned] })}
        />
      ) : null}
    </>
  );
}

function ObjectiveStep({ answers, engine, update }: StepProps) {
  const t = useTranslations("interview.steps");
  const suggestions = engine.copy.objectiveSuggestions[answers.projectType ?? "custom"];
  return (
    <>
      <TextAreaField
        label={t("objective")}
        value={answers.objective}
        onChange={(objective) => update({ objective })}
        placeholder={t("objectivePlaceholder")}
      />
      <div>
        <p className="mb-2 text-sm text-muted-foreground">{t("objectiveSuggestions")}</p>
        <ul className="flex flex-col gap-2">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => update({ objective: s })}
                className="min-h-11 w-full rounded-md border border-border px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function FeaturesStep({ answers, engine, headingId, update }: StepProps) {
  const t = useTranslations("interview.steps");
  const labels = (ids: FeatureId[]) =>
    ids.map((f) => engine.copy.options.feature[f].label).join(", ");
  const mentioned = engine
    .classify(`${answers.projectDescription} ${answers.objective}`)
    .features.filter((f) => !answers.features.includes(f));
  const suggested = engine.suggestFeatures(answers);
  return (
    <>
      <ChoiceGroup<FeatureId>
        multiple
        name="features"
        labelledBy={headingId}
        columns={3}
        options={toOptions(FEATURES, engine.copy.options.feature)}
        value={answers.features}
        onChange={(features) => update({ features })}
      />
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border px-4 has-[:checked]:border-primary">
        <input
          type="checkbox"
          checked={answers.featuresUnknown}
          onChange={(e) => update({ featuresUnknown: e.target.checked })}
          className="size-4 accent-[var(--primary)]"
        />
        <span className="font-medium">{t("dontKnow")}</span>
      </label>
      {mentioned.length > 0 ? (
        <Suggestion
          text={t("mentionsFeatures", { list: labels(mentioned) })}
          actionLabel={t("addThese")}
          onAccept={() => update({ features: [...answers.features, ...mentioned] })}
        />
      ) : null}
      {answers.featuresUnknown && suggested.length > 0 ? (
        <Suggestion
          text={t("usuallyNeed", { list: labels(suggested) })}
          actionLabel={t("addAll")}
          onAccept={() => update({ features: [...answers.features, ...suggested] })}
        />
      ) : null}
    </>
  );
}

function ExistingStep({ answers, engine, headingId, update }: StepProps) {
  const t = useTranslations("interview.steps");
  const hasCode = answers.projectState === "existing" || answers.projectState === "migration";
  return (
    <>
      <ChoiceGroup
        name="projectState"
        labelledBy={headingId}
        options={toOptions(PROJECT_STATES, engine.copy.options.projectState)}
        value={answers.projectState}
        onChange={(projectState) => update({ projectState })}
      />
      {hasCode ? <Note>{t("existingNote")}</Note> : null}
    </>
  );
}

function TechnologyStep({ answers, engine, headingId, update }: StepProps) {
  const t = useTranslations("interview.steps");
  const layers = engine.copy.options.stackLayer;
  return (
    <>
      <ChoiceGroup
        name="techPreference"
        labelledBy={headingId}
        columns={3}
        options={toOptions(TECH_PREFERENCES, engine.copy.options.techPreference)}
        value={answers.techPreference}
        onChange={(techPreference) => update({ techPreference })}
      />
      {answers.techPreference === "own" ? (
        <fieldset>
          <legend className="mb-3 font-medium">{t("yourStack")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {STACK_LAYERS.map((layer) => (
              <TextField
                key={layer}
                label={layers[layer].label}
                placeholder={layers[layer].placeholder}
                value={answers.ownStack[layer]}
                maxLength={layer === "other" ? 300 : 120}
                onChange={(v) => update({ ownStack: { ...answers.ownStack, [layer]: v } })}
              />
            ))}
          </div>
        </fieldset>
      ) : null}
    </>
  );
}

function DatabaseStep({ answers, engine, headingId, update }: StepProps) {
  const t = useTranslations("interview.steps");
  return (
    <>
      <ChoiceGroup
        name="databaseNeed"
        labelledBy={headingId}
        columns={3}
        options={toOptions(DATABASE_NEEDS, engine.copy.options.databaseNeed)}
        value={answers.databaseNeed}
        onChange={(databaseNeed) =>
          update({
            databaseNeed,
            databaseChoice: databaseNeed === "yes" ? answers.databaseChoice : undefined,
          })
        }
      />
      {answers.databaseNeed === "yes" ? (
        <ChoiceGroup
          name="databaseChoice"
          legend={t("whichDatabase")}
          columns={3}
          options={toOptions(DATABASE_CHOICES, engine.copy.options.databaseChoice)}
          value={answers.databaseChoice}
          onChange={(databaseChoice) => update({ databaseChoice })}
        />
      ) : null}
    </>
  );
}

function DevelopmentStep({ answers, engine, headingId, update }: StepProps) {
  const t = useTranslations("interview.steps");
  const rec = answers.developmentMode === "unsure" ? engine.recommend(answers).development : null;
  return (
    <>
      <ChoiceGroup
        name="developmentMode"
        labelledBy={headingId}
        columns={1}
        options={toOptions(DEVELOPMENT_MODES, engine.copy.options.developmentMode)}
        value={answers.developmentMode}
        onChange={(developmentMode) => update({ developmentMode })}
      />
      {rec ? (
        <Recommended
          value={rec.value === "saqina" ? t("buildSaqina") : t("buildAgent")}
          reason={rec.reason}
        />
      ) : null}
    </>
  );
}

function AgentStep({ answers, engine, headingId, update }: StepProps) {
  const rec = answers.agent === "unsure" ? engine.recommend(answers).agent : null;
  return (
    <>
      <ChoiceGroup
        name="agent"
        labelledBy={headingId}
        columns={3}
        options={toOptions(AGENTS, engine.copy.options.agent)}
        value={answers.agent}
        onChange={(agent) => update({ agent })}
      />
      {rec ? <Recommended value={rec.value} reason={rec.reason} /> : null}
    </>
  );
}

function DeploymentStep({ answers, engine, headingId, update }: StepProps) {
  const t = useTranslations("interview.steps");
  const deployment = answers.deployment ? engine.recommend(answers).deployment : null;
  return (
    <>
      <ChoiceGroup
        name="deployment"
        labelledBy={headingId}
        options={toOptions(DEPLOYMENT_TARGETS, engine.copy.options.deployment)}
        value={answers.deployment}
        onChange={(d) => update({ deployment: d })}
      />
      {deployment ? (
        <div aria-live="polite" className="rounded-md border border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {answers.deployment === "unsure" ? `${t("recommended")} ${deployment.value}. ` : ""}
            {deployment.reason}
          </p>
          <ol className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs">
            {deployment.steps.map((s) => (
              <li key={s} className="rounded-sm border border-border px-2 py-1">
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-subtle-foreground">{t("deploymentPlanned")}</p>
        </div>
      ) : null}
    </>
  );
}

function VersioningStep({ answers, engine, headingId, update }: StepProps) {
  const t = useTranslations("interview.steps");
  const rec = engine.recommend({ ...answers, versioning: undefined }).versioning;
  return (
    <>
      <ChoiceGroup
        name="versioning"
        labelledBy={headingId}
        columns={3}
        options={toOptions(VERSIONING_CHOICES, engine.copy.options.versioning)}
        value={answers.versioning}
        onChange={(versioning) => update({ versioning })}
      />
      {rec ? <Recommended value={rec.value ? t("yes") : t("no")} reason={rec.reason} /> : null}
    </>
  );
}

function LandingStep({ answers, engine, update }: StepProps) {
  const t = useTranslations("interview.steps");
  const rec = engine.recommend(answers).landing;
  if (!rec) return <Note>{t("noLanding")}</Note>;
  return (
    <ConceptPicker
      recommendation={rec}
      selection={answers.landing}
      copy={engine.copy}
      onChange={(landing) =>
        update({ landing: landing ? engine.normalizeLanding(landing) : undefined })
      }
    />
  );
}

export const STEP_COMPONENTS: Record<Exclude<StepId, "review">, (props: StepProps) => ReactNode> = {
  project: ProjectStep,
  audience: AudienceStep,
  objective: ObjectiveStep,
  features: FeaturesStep,
  existing: ExistingStep,
  technology: TechnologyStep,
  database: DatabaseStep,
  development: DevelopmentStep,
  agent: AgentStep,
  deployment: DeploymentStep,
  versioning: VersioningStep,
  landing: LandingStep,
};
