import { notFound } from "next/navigation";
import { PdfLink } from "@/components/billing/pdf-link";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { getDocument } from "@/lib/documents/service";
import { getSigningState, toSigningView } from "@/lib/documents/signing";
import { loadIssuer } from "@/lib/white-label/brand";
import { DocumentWorkspace } from "./document-workspace";

/** Server wrapper for /documents/[doc]. */
export async function DocumentPage({
  access,
  docSlug,
}: {
  access: ProjectAccess;
  docSlug: string;
}) {
  const doc = await getDocument(access, docSlug);
  if (!doc) notFound();
  const issuer = await loadIssuer(access.project.organizationId);
  const signing = toSigningView(await getSigningState(db, doc));
  return (
    <>
      <div className="mb-3 flex justify-end">
        <PdfLink kind="document" id={doc.id} />
      </div>
      <DocumentWorkspace
        projectSlug={access.project.slug}
        canEdit={can(access.role, "content:write")}
        signing={signing}
        issuer={issuer}
        canSign={can(access.role, "project:update")}
        doc={{
          slug: doc.slug,
          content: doc.content,
          version: doc.version,
          status: doc.status,
          updatedAt: doc.updatedAt.toISOString(),
        }}
      />
    </>
  );
}
