import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { Container } from "@/components/primitives/container";
import { getLegalDocument, type LegalDocId } from "@/content/legal";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";

interface LegalPageProps {
  locale: Locale;
  doc: LegalDocId;
}

/** Shared layout for Privacy Policy and Terms: draft notice, contents, numbered sections. */
export async function LegalPage({ locale, doc }: LegalPageProps) {
  const t = await getTranslations({ locale, namespace: "legal" });
  const tc = await getTranslations({ locale, namespace: "common.footer" });
  const content = getLegalDocument(locale, doc);
  const other: LegalDocId = doc === "privacy" ? "terms" : "privacy";
  const updated = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    dateStyle: "long",
  }).format(new Date(`${content.updated}T00:00:00Z`));

  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 py-14 sm:py-20">
        <Container className="max-w-3xl">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            {content.title}
          </h1>
          <p className="mt-3 font-mono text-xs text-subtle-foreground">
            {t("updated")}: <time dateTime={content.updated}>{updated}</time>
          </p>

          {/* Honest status: placeholders and missing legal review are stated, not hidden. */}
          <aside
            aria-label={t("draftTitle")}
            className="mt-8 rounded-md border border-warning/50 bg-surface p-4"
          >
            <p className="font-medium text-warning">{t("draftTitle")}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("draftBody")}</p>
          </aside>

          <p className="mt-8 text-pretty leading-relaxed text-muted-foreground">{content.intro}</p>

          <nav aria-labelledby="legal-contents" className="mt-10 border-y border-border py-5">
            <h2 id="legal-contents" className="font-mono text-xs text-subtle-foreground">
              {t("contents")}
            </h2>
            <ol className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {content.sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="inline-flex min-h-11 items-center gap-3 text-sm hover:text-primary"
                  >
                    <span className="font-mono text-xs text-subtle-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-10 space-y-12">
            {content.sections.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                aria-labelledby={`${s.id}-heading`}
                className="scroll-mt-24"
              >
                <h2
                  id={`${s.id}-heading`}
                  className="flex items-baseline gap-3 text-xl font-semibold tracking-tight"
                >
                  <span className="font-mono text-sm font-normal text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.heading}
                </h2>
                <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
                  {s.blocks.map((block) =>
                    "p" in block ? (
                      <p key={block.p}>{block.p}</p>
                    ) : (
                      <ul
                        key={block.list.join()}
                        className="list-disc space-y-2 pl-5 marker:text-subtle-foreground"
                      >
                        {block.list.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground">
            {t("otherDocument")}:{" "}
            <Link href={`/${other}`} className="text-primary hover:underline">
              {tc(other)}
            </Link>
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}
