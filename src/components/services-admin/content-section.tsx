"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Field, TextArea } from "@/components/ui/form";
import type { Faq, Localized, ServiceLocale, Step } from "@/lib/domain/services";
import { cn } from "@/lib/utils";
import { errorAt, LocaleTabs, Section, type SectionProps } from "./editor-ui";
import { LIST_FIELDS } from "./form-state";
import { PairListEditor, StringListEditor } from "./list-editors";

export interface RelatedOption {
  id: string;
  name: string;
  slug: string;
}

export function ContentSection({
  state,
  set,
  errors,
  options,
}: SectionProps & { options: RelatedOption[] }) {
  const t = useTranslations("servicesAdmin.editor");
  const uid = useId();
  const [loc, setLoc] = useState<ServiceLocale>("en");

  const setLocalized = <T,>(current: Localized<T>, value: T) => ({ ...current, [loc]: value });
  const flagged = (["en", "id"] as const).filter((l) =>
    Object.keys(errors).some((p) => p.split(".")[1] === l),
  );
  const text = (field: "title" | "shortDescription" | "timeline") => ({
    id: `${uid}-${field}`,
    label: t(`content.${field}`),
    value: state[field][loc],
    error:
      errorAt(errors, `${field}.${loc}`) ??
      (field === "title" ? errorAt(errors, "title") : undefined),
    onChange: (v: string) => set(field, setLocalized(state[field], v)),
  });
  const title = text("title");
  const short = text("shortDescription");
  const timeline = text("timeline");

  return (
    <Section id="sec-content" title={t("sections.content")}>
      <LocaleTabs
        id={`${uid}-loc`}
        label={t("content.tablist")}
        value={loc}
        onChange={setLoc}
        flagged={flagged}
        options={[
          { value: "en", label: t("content.tabEn") },
          { value: "id", label: t("content.tabId") },
        ]}
      />
      <div
        id={`${uid}-loc-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-loc-tab-${loc}`}
        lang={loc}
        className="space-y-5"
      >
        <Field
          id={title.id}
          label={title.label}
          value={title.value}
          error={title.error}
          maxLength={120}
          onChange={(e) => title.onChange(e.target.value)}
        />
        <TextArea
          id={short.id}
          label={short.label}
          value={short.value}
          error={short.error}
          rows={2}
          maxLength={280}
          onChange={(e) => short.onChange(e.target.value)}
        />
        <TextArea
          id={`${uid}-description`}
          label={t("content.description")}
          value={state.description[loc]}
          error={errorAt(errors, `description.${loc}`)}
          rows={8}
          maxLength={6000}
          onChange={(e) => set("description", setLocalized(state.description, e.target.value))}
        />
        <Field
          id={timeline.id}
          label={timeline.label}
          value={timeline.value}
          error={timeline.error}
          maxLength={160}
          onChange={(e) => timeline.onChange(e.target.value)}
        />
        <div className="grid gap-5 lg:grid-cols-2">
          {LIST_FIELDS.map((field) => (
            <StringListEditor
              key={`${field}-${loc}`}
              id={`${uid}-${field}`}
              label={t(`content.${field}`)}
              values={state[field][loc]}
              error={errorAt(errors, `${field}.${loc}`)}
              onChange={(next) => set(field, setLocalized(state[field], next))}
            />
          ))}
        </div>
        <PairListEditor<Step>
          key={`steps-${loc}`}
          id={`${uid}-steps`}
          label={t("content.steps")}
          values={state.steps[loc]}
          keys={["title", "body"]}
          labels={[t("content.stepTitle"), t("content.stepBody")]}
          maxLengths={[100, 400]}
          blank={{ title: "", body: "" }}
          addLabel={t("list.addStep")}
          maxItems={10}
          error={errorAt(errors, `steps.${loc}`)}
          onChange={(next) => set("steps", setLocalized(state.steps, next))}
        />
        <PairListEditor<Faq>
          key={`faqs-${loc}`}
          id={`${uid}-faqs`}
          label={t("content.faqs")}
          values={state.faqs[loc]}
          keys={["q", "a"]}
          labels={[t("content.faqQuestion"), t("content.faqAnswer")]}
          maxLengths={[200, 1200]}
          blank={{ q: "", a: "" }}
          addLabel={t("list.addFaq")}
          maxItems={15}
          error={errorAt(errors, `faqs.${loc}`)}
          onChange={(next) => set("faqs", setLocalized(state.faqs, next))}
        />
      </div>
      <fieldset aria-describedby={`${uid}-related-hint`}>
        <legend className="mb-1.5 text-sm font-medium">{t("content.related")}</legend>
        <p id={`${uid}-related-hint`} className="mb-2 text-xs text-subtle-foreground">
          {t("content.relatedHint")}
        </p>
        {options.length === 0 ? (
          <p className="text-sm text-subtle-foreground">{t("content.relatedNone")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {options.map((o) => {
              const checked = state.relatedIds.includes(o.id);
              const atLimit = !checked && state.relatedIds.length >= 6;
              return (
                <li key={o.id}>
                  <label
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm",
                      checked ? "border-primary bg-primary/5" : "border-border",
                      atLimit && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atLimit}
                      onChange={() =>
                        set(
                          "relatedIds",
                          checked
                            ? state.relatedIds.filter((x) => x !== o.id)
                            : [...state.relatedIds, o.id],
                        )
                      }
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 truncate">{o.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {errorAt(errors, "relatedIds") ? (
          <p className="mt-1.5 text-sm text-error">{errorAt(errors, "relatedIds")}</p>
        ) : null}
      </fieldset>
    </Section>
  );
}
