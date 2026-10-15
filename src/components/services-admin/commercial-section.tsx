"use client";

import { useTranslations } from "next-intl";
import { Field, Select } from "@/components/ui/form";
import { CURRENCIES } from "@/lib/domain/business";
import { CTA_TYPES, PRICED_TYPES, PRICING_TYPES } from "@/lib/domain/services";
import { errorAt, Section, type SectionProps } from "./editor-ui";
import { SwitchRow } from "./switch";

export function CommercialSection({ state, set, errors }: SectionProps) {
  const t = useTranslations("servicesAdmin");
  const priced = PRICED_TYPES.includes(state.pricingType);
  return (
    <Section id="sec-commercial" title={t("editor.sections.commercial")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          id="svc-pricing-type"
          label={t("editor.commercial.pricingType")}
          value={state.pricingType}
          onChange={(e) => set("pricingType", e.target.value as typeof state.pricingType)}
        >
          {PRICING_TYPES.map((p) => (
            <option key={p} value={p}>
              {t(`pricingTypes.${p}`)}
            </option>
          ))}
        </Select>
        <Select
          id="svc-currency"
          label={t("editor.commercial.currency")}
          value={state.currency}
          onChange={(e) => set("currency", e.target.value as typeof state.currency)}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        {priced ? (
          <Field
            id="svc-amount"
            label={t("editor.commercial.amount")}
            hint={t("editor.commercial.amountHint", { currency: state.currency })}
            placeholder={t("editor.placeholders.amount")}
            error={errorAt(errors, "priceAmount")}
            inputMode="decimal"
            value={state.priceAmount}
            onChange={(e) => set("priceAmount", e.target.value)}
          />
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["en", "id"] as const).map((loc) => (
          <Field
            key={loc}
            id={`svc-price-label-${loc}`}
            lang={loc}
            label={`${t("editor.commercial.priceLabel")} (${loc.toUpperCase()})`}
            hint={t("editor.commercial.priceLabelHint")}
            placeholder={t(`editor.placeholders.priceLabel.${loc}`)}
            error={errorAt(errors, `priceLabel.${loc}`)}
            value={state.priceLabel[loc]}
            maxLength={80}
            onChange={(e) => set("priceLabel", { ...state.priceLabel, [loc]: e.target.value })}
          />
        ))}
      </div>
      <SwitchRow
        id="svc-show-price"
        label={t("editor.commercial.showPrice")}
        hint={t("editor.commercial.showPriceHint")}
        checked={state.showPrice}
        onChange={(v) => set("showPrice", v)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          id="svc-cta-type"
          label={t("editor.commercial.ctaType")}
          value={state.ctaType}
          onChange={(e) => set("ctaType", e.target.value as typeof state.ctaType)}
        >
          {CTA_TYPES.map((c) => (
            <option key={c} value={c}>
              {t(`ctaTypes.${c}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["en", "id"] as const).map((loc) => (
          <Field
            key={loc}
            id={`svc-cta-label-${loc}`}
            lang={loc}
            label={`${t("editor.commercial.ctaLabel")} (${loc.toUpperCase()})`}
            hint={t("editor.commercial.ctaLabelHint")}
            placeholder={t(`editor.placeholders.ctaLabel.${loc}`)}
            error={errorAt(errors, `ctaLabel.${loc}`)}
            value={state.ctaLabel[loc]}
            maxLength={60}
            onChange={(e) => set("ctaLabel", { ...state.ctaLabel, [loc]: e.target.value })}
          />
        ))}
      </div>
    </Section>
  );
}
