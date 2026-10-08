import type { Locale } from "@/i18n/locales";
import { getEngineCopy } from "@/lib/interview/copy";
import { getGeneratorCopy } from "@/lib/projects/copy";
import { generateProject } from "@/lib/projects/generate";
import { createRuleBasedRecommendationEngine } from "@/lib/recommendations/engine";
import { createRuleBasedAnalyzer } from "./analyzer";
import { getProjectCopy } from "./copy";
import type { InterviewData } from "./model";

/**
 * One entry point for everything that reasons about a project in a given language:
 * analysis, recommendations and the generated workspace. Swapping in AI-backed engines
 * later only changes this file.
 */
export function createProjectIntelligence(locale: Locale) {
  const engine = getEngineCopy(locale);
  const copy = getProjectCopy(locale);
  const gen = getGeneratorCopy(locale);
  const analyzer = createRuleBasedAnalyzer(copy, engine);
  const recommender = createRuleBasedRecommendationEngine(copy, engine);

  return {
    locale,
    engine,
    copy,
    gen,
    analyze: (data: InterviewData) => analyzer.analyze(data),
    recommend: (data: InterviewData) => recommender.recommend(data),
    generate(data: InterviewData) {
      const analysis = analyzer.analyze(data);
      const recommendation = recommender.recommend(data);
      return {
        analysis,
        recommendation,
        project: generateProject({ data, analysis, recommendation, engine, copy, gen }),
      };
    },
  };
}

export type ProjectIntelligence = ReturnType<typeof createProjectIntelligence>;
