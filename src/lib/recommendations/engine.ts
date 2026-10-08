import type { Confidence, RecommendationKey, RecommendationSource } from "@/lib/domain/enums";
import type { EngineCopy } from "@/lib/interview/copy/types";
import { isSimpleSite } from "@/lib/interview/rules/profile";
import { recommend } from "@/lib/interview/rules/recommend";
import type { Recommendation } from "@/lib/interview/types";
import type { ProjectCopy } from "@/lib/interviews/copy/types";
import type { InterviewData } from "@/lib/interviews/model";

export interface RecommendationItem {
  key: RecommendationKey;
  label: string;
  value: string;
  /** Extra line under the value, e.g. supporting landing concepts. */
  detail?: string;
  /** Concept ids for the landing item; lets the UI and generator stay language-neutral. */
  ids?: string[];
  reason: string;
  confidence: Confidence;
  source: RecommendationSource;
  /** Values the user can pick instead of typing. */
  alternatives: string[];
}

export interface ProjectRecommendation {
  items: RecommendationItem[];
  /** The Phase 1 recommendation the items were derived from (stack, deployment steps, ...). */
  base: Recommendation;
}

/**
 * Recommends how to build the project and explains why. Deterministic today; an AI engine
 * can implement the same interface later without touching the UI.
 */
export interface RecommendationEngine {
  recommend(data: InterviewData): ProjectRecommendation;
}

const ALTERNATIVES: Record<RecommendationKey, string[]> = {
  application: ["Next.js + TypeScript", "Remix + TypeScript", "Laravel", "Astro", "SvelteKit"],
  database: ["PostgreSQL", "PostgreSQL (Supabase)", "MySQL", "SQLite", "MongoDB"],
  deployment: ["Vercel", "Netlify", "Railway", "Fly.io", "Self-hosted (Docker)"],
  authentication: ["Google + Email", "Email + Password", "Google", "Magic link"],
  architecture: [],
  build_strategy: ["Saqina Dev", "Claude", "Codex", "Cursor", "Kiro"],
  landing: [],
};

function confidenceFrom(chosen: boolean, uncertain: boolean): Confidence {
  if (chosen) return "high";
  return uncertain ? "low" : "medium";
}

export function createRuleBasedRecommendationEngine(
  copy: ProjectCopy,
  engine: EngineCopy,
): RecommendationEngine {
  const t = copy.recommendation;
  return {
    recommend(data) {
      const { answers, details, overrides } = data;
      const base = recommend(answers, engine);
      const items: RecommendationItem[] = [];
      const add = (item: Omit<RecommendationItem, "label" | "alternatives">) => {
        const override = overrides[item.key];
        items.push({
          ...item,
          label: t.labels[item.key],
          alternatives: ALTERNATIVES[item.key],
          // A user override replaces the value but keeps the original reason visible as context.
          ...(override
            ? {
                value: override,
                detail: undefined,
                ids: undefined,
                source: "user",
                confidence: "high",
                reason: t.userOverride,
              }
            : {}),
        });
      };

      const frontend =
        base.stack.value.find((s) => s.layer === engine.recommend.stack.layers.frontend)?.value ??
        base.stack.value.find((s) => s.layer === engine.recommend.stack.layers.api)?.value ??
        base.stack.value[0]?.value ??
        "Next.js + TypeScript";
      add({
        key: "application",
        value: frontend,
        reason: base.stack.chosen
          ? t.application.own
          : isSimpleSite(answers)
            ? t.application.simple
            : answers.projectType === "mobile-backend"
              ? t.application.api
              : t.application.app,
        confidence: confidenceFrom(base.stack.chosen, answers.techPreference === "unknown"),
        source: base.stack.chosen ? "user" : "recommended",
      });

      add({
        key: "database",
        value: base.database.value,
        reason: base.database.reason,
        confidence: confidenceFrom(
          base.database.chosen,
          answers.databaseNeed !== "yes" && answers.databaseNeed !== "no",
        ),
        source: base.database.chosen ? "user" : "recommended",
      });

      add({
        key: "deployment",
        value: base.deployment.value,
        reason: base.deployment.reason,
        confidence: confidenceFrom(base.deployment.chosen, !base.deployment.chosen),
        source: base.deployment.chosen ? "user" : "recommended",
      });

      const methods = details.authMethods.filter((m) => m !== "none");
      const wantsAuth = answers.features.includes("auth") || answers.features.includes("rbac");
      if (details.authMethods.includes("none") && !wantsAuth) {
        add({
          key: "authentication",
          value: t.auth.none,
          reason: t.auth.noneReason,
          confidence: "high",
          source: "user",
        });
      } else if (methods.length > 0) {
        add({
          key: "authentication",
          value: t.auth.chosen(engine.joinList(methods.map((m) => copy.authMethods[m]))),
          reason: t.auth.chosenReason,
          confidence: "high",
          source: "user",
        });
      } else if (wantsAuth) {
        add({
          key: "authentication",
          value: t.auth.recommended,
          reason: t.auth.recommendedReason,
          confidence: "medium",
          source: "recommended",
        });
      }

      const arch = isSimpleSite(answers)
        ? { value: t.architecture.staticSite, reason: t.architecture.staticReason }
        : answers.projectType === "mobile-backend"
          ? { value: t.architecture.api, reason: t.architecture.apiReason }
          : base.complexity.level === "high" || answers.features.includes("multi-tenant")
            ? { value: t.architecture.modular, reason: t.architecture.modularReason }
            : { value: t.architecture.fullStack, reason: t.architecture.fullStackReason };
      add({
        key: "architecture",
        ...arch,
        confidence: base.complexity.level === "high" ? "medium" : "high",
        source: "recommended",
      });

      add({
        key: "build_strategy",
        value:
          base.development.value === "saqina"
            ? t.buildStrategy.saqina
            : t.buildStrategy.external(base.agent?.value ?? "Claude"),
        reason: base.development.reason,
        confidence: confidenceFrom(base.development.chosen, !base.development.chosen),
        source: base.development.chosen ? "user" : "recommended",
      });

      if (base.landing) {
        add({
          key: "landing",
          value: engine.concepts[base.landing.primary].name,
          detail:
            base.landing.supporting.length > 0
              ? `+ ${base.landing.supporting.map((c) => engine.concepts[c].name).join(", ")}`
              : undefined,
          ids: [base.landing.primary, ...base.landing.supporting],
          reason: base.landing.reason,
          confidence: base.landing.overridden ? "high" : "medium",
          source: base.landing.overridden ? "user" : "recommended",
        });
      }

      return { items, base };
    },
  };
}
