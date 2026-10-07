import { defaultCopy, type EngineCopy } from "../copy";
import type { ModuleId } from "../copy/types";
import type { FeatureId } from "../options";
import type { Answers, Insight, StructureId } from "../types";
import { appFeaturesIn, DATA_FEATURES, DATA_HEAVY_TYPES, isContentSite } from "./profile";

const MODULE_BY_FEATURE: Partial<Record<FeatureId, ModuleId>> = {
  inventory: "inventory",
  payment: "payment",
  booking: "booking",
  pos: "pos",
};

/**
 * Modules a company site grows into. Three or more modules means it is really a
 * business application, not a website with a login.
 */
export function companyModules(answers: Answers): ModuleId[] {
  const modules: ModuleId[] = ["website"];
  const staff = answers.audience.includes("employees") || answers.features.includes("rbac");
  if (staff) modules.push("employeePortal");
  else if (answers.features.includes("auth")) modules.push("customerPortal");
  for (const feature of answers.features) {
    const module = MODULE_BY_FEATURE[feature];
    if (module) modules.push(module);
  }
  return modules;
}

/** Which structure a content site with app features should become. */
function suggestedStructure(answers: Answers): StructureId {
  return answers.projectType === "company-profile" && companyModules(answers).length >= 3
    ? "business-app"
    : "portal";
}

/** Human label for a structure id, derived from the current answers and language. */
export function structureLabel(answers: Answers, copy: EngineCopy = defaultCopy): string | null {
  const structure = answers.structure;
  if (!structure) return null;
  if (structure === "business-app") return copy.insights.businessApp;
  if (answers.projectType === "company-profile") {
    return companyModules(answers)
      .map((m) => copy.insights.modules[m])
      .join(" + ");
  }
  return (
    (answers.projectType && copy.insights.portal[answers.projectType]) ??
    copy.insights.webAppFallback
  );
}

const dismiss =
  (id: string) =>
  (a: Answers): Answers => ({ ...a, dismissedInsights: [...a.dismissedInsights, id] });

/**
 * Contradictions, unrealistic combinations and simpler alternatives.
 * Every insight offers a choice; nothing is changed without the user's action.
 */
export function getInsights(answers: Answers, copy: EngineCopy = defaultCopy): Insight[] {
  const insights: Insight[] = [];
  const type = answers.projectType;
  const t = copy.insights;
  const listFeatures = (ids: FeatureId[]) =>
    copy.joinList(ids.map((id) => copy.options.feature[id].label.toLowerCase()));

  // 1. Content site with application features.
  const appFeatures = appFeaturesIn(answers).filter((f) => f !== "multi-tenant");
  if (type && isContentSite(answers) && appFeatures.length > 0 && !answers.structure) {
    const structure = suggestedStructure(answers);
    const label = structureLabel({ ...answers, structure }, copy) ?? t.webAppFallback;
    const noun = t.typeNoun[type] ?? "";
    const isBusinessApp = structure === "business-app";
    const modules = companyModules(answers)
      .map((m) => t.modules[m])
      .join(" + ");
    insights.push({
      id: "content-site-app-features",
      severity: "info",
      step: "features",
      title: isBusinessApp ? t.appFeatures.titleBusiness(noun) : t.appFeatures.titleWeb,
      message: isBusinessApp
        ? t.appFeatures.messageBusiness(listFeatures(appFeatures), label, modules)
        : t.appFeatures.messageWeb(noun, listFeatures(appFeatures), label),
      actions: [
        { label: t.appFeatures.use(label), apply: (a) => ({ ...a, structure }) },
        { label: t.appFeatures.keep, apply: dismiss("content-site-app-features") },
      ],
    });
  }

  // 2. Multi-tenant on a personal or content site is almost always over-engineering.
  if (isContentSite(answers) && answers.features.includes("multi-tenant")) {
    insights.push({
      id: "content-site-multi-tenant",
      severity: "warning",
      step: "features",
      title: t.multiTenant.title,
      message: t.multiTenant.message,
      actions: [
        {
          label: t.multiTenant.replace,
          apply: (a) => ({
            ...a,
            features: [
              ...a.features.filter((f) => f !== "multi-tenant"),
              ...(a.features.includes("rbac") ? [] : (["rbac"] as FeatureId[])),
            ],
          }),
        },
        { label: t.multiTenant.keep, apply: dismiss("content-site-multi-tenant") },
      ],
    });
  }

  // 3. Data-driven features but "no database".
  if (answers.databaseNeed === "no") {
    const dataFeatures = answers.features.filter((f) => DATA_FEATURES.includes(f));
    const dataType = type && DATA_HEAVY_TYPES.includes(type);
    if (dataFeatures.length > 0 || dataType) {
      const what = dataFeatures.length > 0 ? listFeatures(dataFeatures) : t.noDatabase.coreRecords;
      insights.push({
        id: "data-without-database",
        severity: "warning",
        step: "database",
        title: t.noDatabase.title,
        message: t.noDatabase.message(what),
        actions: [
          {
            label: t.noDatabase.add,
            apply: (a) => ({ ...a, databaseNeed: "yes", databaseChoice: "recommend" }),
          },
          { label: t.noDatabase.keep, apply: dismiss("data-without-database") },
        ],
      });
    }
  }

  // 4. Payments without any form of identity.
  if (answers.features.includes("payment") && !answers.features.includes("auth")) {
    insights.push({
      id: "payment-without-auth",
      severity: "info",
      step: "features",
      title: t.paymentNoAuth.title,
      message: t.paymentNoAuth.message,
      actions: [
        { label: t.paymentNoAuth.add, apply: (a) => ({ ...a, features: [...a.features, "auth"] }) },
        { label: t.paymentNoAuth.keep, apply: dismiss("payment-without-auth") },
      ],
    });
  }

  // 5. Existing codebase but building inside Saqina Dev.
  if (
    (answers.projectState === "existing" || answers.projectState === "migration") &&
    answers.developmentMode === "saqina"
  ) {
    insights.push({
      id: "existing-in-saqina",
      severity: "info",
      step: "development",
      title: t.existingInSaqina.title,
      message: t.existingInSaqina.message,
      actions: [
        {
          label: t.existingInSaqina.switch,
          apply: (a) => ({ ...a, developmentMode: "external" }),
        },
        { label: t.existingInSaqina.keep, apply: dismiss("existing-in-saqina") },
      ],
    });
  }

  return insights.filter((i) => !answers.dismissedInsights.includes(i.id));
}
