import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { InquiriesList } from "@/components/services-admin/inquiries-list";
import { Link } from "@/i18n/navigation";
import { requireActorPage } from "@/lib/auth/server";
import { INQUIRY_STATUSES, type InquiryStatus } from "@/lib/domain/services";
import { listInquiries } from "@/lib/services/inquiries";
import { cn } from "@/lib/utils";

/** Inquiries sent from the public pages. The layout and the service both require an owner. */
export default async function InquiriesPage({
  searchParams,
}: PageProps<"/[locale]/dashboard/services/inquiries">) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = INQUIRY_STATUSES.find((s) => s === raw) as InquiryStatus | undefined;
  const actor = await requireActorPage("/dashboard/services/inquiries");
  const [rows, t, tc] = await Promise.all([
    listInquiries(actor, status),
    getTranslations("servicesAdmin.inquiries"),
    getTranslations("servicesAdmin"),
  ]);
  const filters: { value: InquiryStatus | undefined; label: string }[] = [
    { value: undefined, label: t("filterAll") },
    ...INQUIRY_STATUSES.map((s) => ({ value: s, label: tc(`inquiryStatuses.${s}`) })),
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <nav aria-label={t("filterLabel")}>
        <ul className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <li key={f.value ?? "all"}>
              <Link
                href={
                  f.value
                    ? `/dashboard/services/inquiries?status=${f.value}`
                    : "/dashboard/services/inquiries"
                }
                aria-current={f.value === status ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-md border px-3 text-sm",
                  f.value === status
                    ? "border-primary text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows.length === 0 ? (
        <EmptyState title={t("empty.title")} body={t("empty.body")} />
      ) : (
        <InquiriesList rows={rows} />
      )}
    </div>
  );
}
