"use client";

import { useTranslations } from "next-intl";
import { errorAt, Section, type SectionProps } from "./editor-ui";
import { SwitchRow } from "./switch";

const FLAGS = ["isPublished", "isPublic", "isComingSoon", "isFeatured"] as const;

export function PublicationSection({ state, set, errors }: SectionProps) {
  const t = useTranslations("servicesAdmin.editor");
  const titleError = errorAt(errors, "title");
  return (
    <Section id="sec-publication" title={t("sections.publication")}>
      <div className="space-y-3">
        {FLAGS.map((flag) => (
          <SwitchRow
            key={flag}
            id={`svc-${flag}`}
            label={t(`publication.${flag}`)}
            hint={t(`publication.${flag}Hint`)}
            checked={state[flag]}
            onChange={(v) => set(flag, v)}
          />
        ))}
      </div>
      {state.isPublished && titleError ? (
        <p role="alert" className="text-sm text-error">
          {titleError}
        </p>
      ) : null}
    </Section>
  );
}
