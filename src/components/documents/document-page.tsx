import { notFound } from "next/navigation";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permissions";
import { getDocument } from "@/lib/documents/service";
import { DocumentWorkspace } from "./document-workspace";

/** Server wrapper shared by /prd and /documents/[doc]. */
export async function DocumentPage({
  access,
  docSlug,
}: {
  access: ProjectAccess;
  docSlug: string;
}) {
  const doc = await getDocument(access, docSlug);
  if (!doc) notFound();
  return (
    <DocumentWorkspace
      projectSlug={access.project.slug}
      canEdit={can(access.role, "content:write")}
      doc={{
        slug: doc.slug,
        content: doc.content,
        version: doc.version,
        status: doc.status,
        updatedAt: doc.updatedAt.toISOString(),
      }}
    />
  );
}
