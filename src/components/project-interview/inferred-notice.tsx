import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { EngineCopy } from "@/lib/interview/copy/types";
import type { InterviewData, QuestionKey } from "@/lib/interviews/model";

/** "We inferred this" with Confirm / Change. Inferred values never count as confirmed. */
export function InferredNotice({
  questionKey,
  data,
  engine,
  onConfirm,
}: {
  questionKey: QuestionKey;
  data: InterviewData;
  engine: EngineCopy;
  onConfirm: () => void;
}) {
  const t = useTranslations("project.interview.inferred");
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const { answers } = data;
  const value =
    questionKey === "projectType" && answers.projectType
      ? engine.options.projectType[answers.projectType].label
      : questionKey === "features"
        ? engine.joinList(answers.features.map((f) => engine.options.feature[f].label))
        : questionKey === "audience"
          ? engine.joinList(answers.audience.map((a) => engine.options.audience[a].label))
          : "";
  if (!value) return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-md border border-info/40 bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm">
        <span className="text-info">{t("title")}: </span>
        <span className="font-medium">{value}</span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" onClick={onConfirm}>
          {t("confirm")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          {t("change")}
        </Button>
      </div>
    </div>
  );
}
