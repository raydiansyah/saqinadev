import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { listDocLinkStates } from "@/lib/docsync/config";
import { getDocument } from "@/lib/documents/service";
import { getSigningState, toSigningView } from "@/lib/documents/signing";
import { canStartBuilding } from "@/lib/studio/ready";
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
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, access.project.organizationId));
  const signing = toSigningView(await getSigningState(db, doc));
  const sync = (await listDocLinkStates(access.project.id)).find((s) => s.documentId === doc.id);
  return (
    <DocumentWorkspace
      sync={sync ?? null}
      projectSlug={access.project.slug}
      canEdit={can(access.role, "content:write")}
      signing={signing}
      issuer={org?.name ?? ""}
      canSign={can(access.role, "project:update")}
      // Approved PRD or plan, or a signed and issued agreement: the work can begin.
      startBuilding={can(access.role, "content:write") && canStartBuilding(doc)}
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
