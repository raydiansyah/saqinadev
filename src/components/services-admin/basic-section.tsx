"use client";

import { useTranslations } from "next-intl";
import { ServiceIcon } from "@/components/services/service-icon";
import { Field, Select } from "@/components/ui/form";
import { SERVICE_CATEGORIES, SERVICE_ICONS } from "@/lib/domain/services";
import { cn } from "@/lib/utils";
import { errorAt, Section, type SectionProps } from "./editor-ui";

export function BasicSection({ state, set, errors }: SectionProps) {
  const t = useTranslations("servicesAdmin");
  return (
    <Section id="sec-basic" title={t("editor.sections.basic")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="svc-internal-name"
          label={t("editor.basic.internalName")}
          hint={t("editor.basic.internalNameHint")}
          error={errorAt(errors, "internalName")}
          value={state.internalName}
          maxLength={120}
          onChange={(e) => set("internalName", e.target.value)}
        />
        <Field
          id="svc-slug"
          label={t("editor.basic.slug")}
          hint={t("editor.basic.slugHint")}
          error={errorAt(errors, "slug")}
          value={state.slug}
          maxLength={80}
          autoCapitalize="none"
          spellCheck={false}
          className="font-mono"
          onChange={(e) => set("slug", e.target.value)}
        />
        <Select
          id="svc-category"
          label={t("editor.basic.category")}
          value={state.category}
          error={errorAt(errors, "category")}
          onChange={(e) => set("category", e.target.value as typeof state.category)}
        >
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`categories.${c}`)}
            </option>
          ))}
        </Select>
        <Field
          id="svc-order"
          label={t("editor.basic.displayOrder")}
          hint={t("editor.basic.displayOrderHint")}
          error={errorAt(errors, "displayOrder")}
          inputMode="numeric"
          value={state.displayOrder}
          onChange={(e) => set("displayOrder", e.target.value)}
        />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t("editor.basic.icon")}</legend>
        <div
          role="radiogroup"
          aria-label={t("editor.basic.iconGroup")}
          className="flex flex-wrap gap-2"
        >
          {SERVICE_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              role="radio"
              aria-checked={state.icon === icon}
              aria-label={t(`icons.${icon}`)}
              title={t(`icons.${icon}`)}
              onClick={() => set("icon", icon)}
              className={cn(
                "inline-flex size-11 cursor-pointer items-center justify-center rounded-md border",
                state.icon === icon
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border-strong text-muted-foreground hover:bg-surface-raised",
              )}
            >
              <ServiceIcon name={icon} className="size-5" />
            </button>
          ))}
        </div>
      </fieldset>
      <Field
        id="svc-image"
        type="url"
        label={t("editor.basic.imageUrl")}
        hint={t("editor.basic.imageUrlHint")}
        error={errorAt(errors, "imageUrl")}
        placeholder="https://"
        value={state.imageUrl}
        maxLength={500}
        autoCapitalize="none"
        spellCheck={false}
        onChange={(e) => set("imageUrl", e.target.value)}
      />
    </Section>
  );
}
