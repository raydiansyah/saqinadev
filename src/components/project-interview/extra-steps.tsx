import { useTranslations } from "next-intl";
import { useId } from "react";
import { ChoiceGroup } from "@/components/interview/choice-group";
import { TextArea } from "@/components/ui/form";
import type { ProjectCopy } from "@/lib/interviews/copy/types";
import {
  AUTH_METHODS,
  type AuthMethodId,
  FOLLOW_UP_ANSWERS,
  type FollowUpAnswer,
  followUpsFor,
  type InterviewData,
  PLATFORMS,
  type PlatformId,
  type ProjectDetails,
  TIMELINES,
} from "@/lib/interviews/model";

export interface ExtraStepProps {
  data: InterviewData;
  copy: ProjectCopy;
  headingId: string;
  updateDetails: (patch: Partial<ProjectDetails>) => void;
}

/** Type-specific questions: a marketplace is asked about sellers, a portfolio never is. */
export function FollowUpsStep({ data, copy, updateDetails }: ExtraStepProps) {
  const t = useTranslations("project.interview.followups");
  const keys = followUpsFor(data.answers.projectType);
  const labels: Record<FollowUpAnswer, string> = {
    yes: t("yes"),
    no: t("no"),
    unsure: t("unsure"),
  };
  return (
    <div className="space-y-5">
      {keys.map((key) => (
        <fieldset key={key} className="rounded-md border border-border p-4">
          <legend className="px-1 font-medium">{copy.followUps[key].question}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {FOLLOW_UP_ANSWERS.map((answer) => (
              <label
                key={answer}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-4 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/[0.07] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
              >
                <input
                  type="radio"
                  name={`followup-${key}`}
                  value={answer}
                  checked={data.details.followUps[key] === answer}
                  onChange={() =>
                    updateDetails({ followUps: { ...data.details.followUps, [key]: answer } })
                  }
                  className="size-4 accent-[var(--primary)]"
                />
                {labels[answer]}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function PlatformStep({ data, copy, updateDetails }: ExtraStepProps) {
  const t = useTranslations("project.interview.platform");
  const platformOptions = PLATFORMS.map((id) => ({ id, label: copy.platforms[id] }));
  const authOptions = AUTH_METHODS.map((id) => ({ id, label: copy.authMethods[id] }));
  return (
    <div className="space-y-8">
      <ChoiceGroup<PlatformId>
        name="platforms"
        legend={t("platforms")}
        multiple
        columns={3}
        options={platformOptions}
        value={data.details.platforms}
        onChange={(platforms) => updateDetails({ platforms })}
      />
      <ChoiceGroup<AuthMethodId>
        name="authMethods"
        legend={t("auth")}
        multiple
        columns={3}
        options={authOptions}
        value={data.details.authMethods}
        onChange={(next) => {
          // "No sign-in" excludes the other methods and vice versa.
          const added = next.find((m) => !data.details.authMethods.includes(m));
          updateDetails({
            authMethods: added === "none" ? ["none"] : next.filter((m) => m !== "none"),
          });
        }}
      />
    </div>
  );
}

export function ConstraintsStep({ data, copy, updateDetails }: ExtraStepProps) {
  const t = useTranslations("project.interview.constraints");
  const id = useId();
  return (
    <div className="space-y-8">
      <TextArea
        id={`${id}-constraints`}
        label={t("label")}
        placeholder={t("placeholder")}
        value={data.details.constraints}
        maxLength={2000}
        rows={4}
        onChange={(e) => updateDetails({ constraints: e.target.value })}
      />
      <ChoiceGroup
        name="timeline"
        legend={t("timeline")}
        columns={2}
        options={TIMELINES.map((id) => ({ id, label: copy.timelines[id] }))}
        value={data.details.timeline}
        onChange={(timeline) => updateDetails({ timeline })}
      />
    </div>
  );
}
