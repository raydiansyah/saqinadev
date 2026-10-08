import type { Metadata } from "next";
import { DocumentPage } from "@/components/documents/document-page";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/project/[slug]/documents/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  return { title: `${doc.toUpperCase()}.md`, robots: { index: false } };
}

export default async function DocumentDetailPage({
  params,
}: PageProps<"/[locale]/project/[slug]/documents/[doc]">) {
  const { slug, doc } = await params;
  const access = await projectPageAccess(slug);
  return <DocumentPage access={access} docSlug={doc} />;
}
