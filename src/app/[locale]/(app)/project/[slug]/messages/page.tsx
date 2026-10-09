import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { MessageThread } from "@/components/engagement/message-thread";
import { Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { listMessages } from "@/lib/engagement/messages";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("engagement.messages");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function MessagesPage({
  params,
}: PageProps<"/[locale]/project/[slug]/messages">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [t, common, rows] = await Promise.all([
    getTranslations("engagement.messages"),
    getTranslations("engagement.common"),
    listMessages(access.project.id),
  ]);
  const { project } = access;

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      {!project.clientId || !project.portalEnabled ? (
        <Notice tone="info" className="mb-4">
          {common("portalOff")}{" "}
          <Link href={`/project/${slug}/settings`} className="underline underline-offset-4">
            {common("openSettings")}
          </Link>
        </Notice>
      ) : null}
      <MessageThread
        slug={slug}
        canWrite={can(access.role, "content:write")}
        messages={rows.map((m) => ({
          id: m.id,
          side: m.side,
          body: m.body,
          authorName: m.authorName,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
