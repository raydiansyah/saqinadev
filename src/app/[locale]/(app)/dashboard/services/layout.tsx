import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { ServicesSubnav } from "@/components/services-admin/subnav";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireActorPage } from "@/lib/auth/server";
import { isPlatformOwner } from "@/lib/platform/roles";
import { newInquiryCount } from "@/lib/services/inquiries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("servicesAdmin");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Platform owners only. Everyone else gets the generic 404 (the area is not advertised). */
export default async function ServicesAdminLayout({
  children,
}: LayoutProps<"/[locale]/dashboard/services">) {
  const actor = await requireActorPage("/dashboard/services");
  if (!(await isPlatformOwner(actor))) notFound();
  const [t, newCount] = await Promise.all([
    getTranslations("servicesAdmin"),
    newInquiryCount(actor),
  ]);
  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("description")}
        actions={
          <Link href="/dashboard/services/new" className={buttonVariants()}>
            {t("nav.newService")}
          </Link>
        }
      />
      <ServicesSubnav newInquiries={newCount} />
      <div className="pt-6">{children}</div>
    </>
  );
}
