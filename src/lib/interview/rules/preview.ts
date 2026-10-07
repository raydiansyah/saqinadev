import { defaultCopy, type EngineCopy } from "../copy";
import type { FeatureId } from "../options";
import { findProfile, profileFor } from "../profiles";
import type { Answers, ProjectPreview } from "../types";
import { complexityOf } from "./profile";
import { projectName, recommend, suggestFeatures } from "./recommend";

/**
 * Live picture of the project while the interview is in progress.
 * Values the user has not confirmed are flagged `suggested` so the UI can tell them apart.
 */
export function previewProject(answers: Answers, copy: EngineCopy = defaultCopy): ProjectPreview {
  const profile = profileFor(answers);
  const profileCopy = profile ? copy.profiles[profile.id] : undefined;

  const users = answers.audience.length
    ? { items: answers.audience.map((a) => copy.options.audience[a].label), suggested: false }
    : { items: profileCopy?.users ?? [], suggested: true };

  const core = answers.features.length
    ? { items: answers.features.map((f) => copy.options.feature[f].label), suggested: false }
    : { items: profileCopy?.core ?? [], suggested: true };

  const known = !!answers.projectType;
  const rec = known ? recommend(answers, copy) : null;

  return {
    label: projectName(answers, copy),
    users,
    core,
    // Complexity is only meaningful once the feature list has been answered.
    complexity:
      known && (answers.features.length > 0 || answers.featuresUnknown)
        ? complexityOf(answers, copy).level
        : null,
    build: answers.developmentMode && rec ? rec.development.value : null,
    stack: answers.techPreference && rec ? rec.stack.value.map((s) => s.value) : [],
    landing: rec?.landing ?? null,
  };
}

/** Answers synthesized from a single sentence, for the landing page demo. */
export function answersFromIdea(idea: string, base: Answers): Answers {
  const profile = findProfile(idea);
  const draft: Answers = {
    ...base,
    projectDescription: idea.trim(),
    projectType: profile?.type ?? base.projectType,
  };
  const features: FeatureId[] = [
    ...new Set([...(profile?.features ?? []), ...suggestFeatures(draft)]),
  ];
  return { ...draft, features };
}
