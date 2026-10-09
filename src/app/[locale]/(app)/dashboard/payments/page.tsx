import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { orgPageAccess } from "@/components/finance/page-access";
import { PaymentTable } from "@/components/finance/payment-table";
import { requireActorPage } from "@/lib/auth/server";
import { orgPayments } from "@/lib/billing/summary";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("finance.payments");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function PaymentsPage() {
  const actor = await requireActorPage("/dashboard/payments");
  const { org } = await orgPageAccess(actor, "billing:read");
  const [payments, t] = await Promise.all([
    orgPayments(org.id),
    getTranslations("finance.payments"),
  ]);
  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      {payments.length === 0 ? (
        <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <PaymentTable payments={payments} />
      )}
    </>
  );
}
