import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Letterhead } from "@/components/documents/letterhead";
import MarkdownPreview from "@/components/documents/markdown-preview";
import { SigningPanel } from "@/components/documents/signing-panel";
import { formatDate } from "@/components/portal/format";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { stripProvenance } from "@/lib/docsync/paths";
import { getSigningState, toSigningView } from "@/lib/documents/signing";
import { clientDocument } from "@/lib/portal/views";
import { orNotFound, portalPageAccess } from "../../../../access";

async function load(slug: string, doc: string) {
  return orNotFound(clientDocument(await portalPageAccess(slug), doc));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/documents/[doc]">): Promise<Metadata> {
  const { slug, doc } = await params;
  return { title: (await load(slug, doc)).title };
}

export default async function PortalDocumentPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/documents/[doc]">) {
  const { slug, doc: docSlug } = await params;
  const doc = await load(slug, docSlug);
  const access = await portalPageAccess(slug);
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, access.project.organizationId));
  const signing = toSigningView(await getSigningState(db, doc));
  const [t, locale] = await Promise.all([getTranslations("portal.documents"), getLocale()]);
  return (
    <article>
      <Link
        href={`/portal/projects/${slug}/documents`}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <span aria-hidden="true">←</span> {t("back")}
      </Link>
      <header className="mt-2 mb-6 border-b border-border pb-4">
        <h2 className="text-xl font-semibold break-words">{doc.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {doc.reference ? <span className="font-mono">{doc.reference} · </span> : null}
          {t("version", { version: doc.version })} ·{" "}
          {t("updated", { date: formatDate(doc.updatedAt, locale) })}
        </p>
      </header>
      <div className="min-w-0 overflow-x-auto break-words">
        {/* The "Imported from" line is for the team; the client reads the document itself. */}
        <Letterhead issuer={org?.name ?? ""} reference={doc.reference} />
        <MarkdownPreview content={stripProvenance(doc.content)} />
      </div>
      <SigningPanel side="client" projectSlug={slug} docSlug={doc.slug} view={signing} canAct />
    </article>
  );
}
