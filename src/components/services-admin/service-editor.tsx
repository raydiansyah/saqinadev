"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  createServiceAction,
  updateServiceAction,
} from "@/app/[locale]/(app)/dashboard/services/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { Link, useRouter } from "@/i18n/navigation";
import type { ServiceRow } from "@/lib/services/admin";
import { BasicSection } from "./basic-section";
import { CommercialSection } from "./commercial-section";
import { ContentSection, type RelatedOption } from "./content-section";
import type { Errors, SetField } from "./editor-ui";
import { emptyState, type FormState, stateFromRow, toPayload } from "./form-state";
import { PublicationSection } from "./publication-section";
import { SeoSection } from "./seo-section";
import { useErrorMessage } from "./service-error";

const SECTIONS = ["basic", "content", "commercial", "publication", "seo"] as const;
type SectionKey = (typeof SECTIONS)[number];

const BASIC = ["slug", "internalName", "category", "icon", "imageUrl", "displayOrder"];
const COMMERCIAL = ["pricingType", "priceAmount", "currency", "priceLabel", "ctaType", "ctaLabel"];
const PUBLICATION = ["isPublished", "isPublic", "isComingSoon", "isFeatured", "showPrice"];
const SEO = ["metaTitle", "metaDescription"];

/** Which section an error path belongs to, so the section nav can flag it. */
function sectionOf(path: string): SectionKey {
  const head = path.split(".")[0];
  if (BASIC.includes(head)) return "basic";
  if (COMMERCIAL.includes(head)) return "commercial";
  if (PUBLICATION.includes(head)) return "publication";
  if (SEO.includes(head)) return "seo";
  return "content";
}

/** New and edit share this form. Sections are separate components; state lives here. */
export function ServiceEditor({
  service,
  options,
}: {
  service?: ServiceRow;
  options: RelatedOption[];
}) {
  const t = useTranslations("servicesAdmin.editor");
  const app = useTranslations("app.errors");
  const message = useErrorMessage();
  const router = useRouter();
  const [state, setState] = useState<FormState>(() =>
    service ? stateFromRow(service) : emptyState(),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set: SetField = (key, value) => {
    setState((s) => ({ ...s, [key]: value }));
    setSaved(null);
  };

  const submit = () => {
    setSaved(null);
    setGeneral(null);
    const { payload, problems } = toPayload(state);
    if (Object.keys(problems).length > 0) {
      setErrors(Object.fromEntries(Object.entries(problems).map(([p, c]) => [p, message(c, p)])));
      return;
    }
    setErrors({});
    start(async () => {
      const result = service
        ? await updateServiceAction(service.id, payload)
        : await createServiceAction(payload);
      if (!result.ok) {
        const fields = result.fields ?? {};
        setErrors(Object.fromEntries(Object.entries(fields).map(([p, c]) => [p, message(c, p)])));
        if (Object.keys(fields).length === 0)
          setGeneral(
            app.has(result.code as never) ? app(result.code as never) : app("INTERNAL_ERROR"),
          );
        return;
      }
      if (service) {
        setSaved(t("saved"));
        router.refresh();
      } else {
        router.push(`/dashboard/services/${result.data.id}`);
      }
    });
  };

  const flagged = new Set(Object.keys(errors).map(sectionOf));
  const sectionProps = { state, set, errors };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/dashboard/services"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {t("backToList")}
          </Link>
          <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">
            {service ? service.internalName : t("newTitle")}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {service ? (
            <Link
              href={`/dashboard/services/${service.id}/preview`}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("preview")}
            </Link>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : service ? t("save") : t("create")}
          </Button>
        </div>
      </div>

      <nav aria-label={t("sectionNav")}>
        <ul className="flex gap-1 overflow-x-auto">
          {SECTIONS.map((s) => (
            <li key={s}>
              <a
                href={`#sec-${s}`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground hover:bg-surface-raised hover:text-foreground"
              >
                {t(`sections.${s}`)}
                {flagged.has(s) ? (
                  <span className="text-error" role="img" aria-label={t("content.hasErrors")}>
                    !
                  </span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {Object.keys(errors).length > 0 ? <Notice tone="error">{t("invalidSummary")}</Notice> : null}
      {general ? <Notice tone="error">{general}</Notice> : null}

      <BasicSection {...sectionProps} />
      <ContentSection {...sectionProps} options={options.filter((o) => o.id !== service?.id)} />
      <CommercialSection {...sectionProps} />
      <PublicationSection {...sectionProps} />
      <SeoSection {...sectionProps} />

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : service ? t("save") : t("create")}
        </Button>
        {saved ? <Notice tone="success">{saved}</Notice> : null}
        {service ? <p className="text-xs text-subtle-foreground">{t("previewHint")}</p> : null}
      </div>
    </form>
  );
}
