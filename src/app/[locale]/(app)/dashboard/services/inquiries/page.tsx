import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { InquiriesList } from "@/components/services-admin/inquiries-list";
import { buttonVariants } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { requireActorPage } from "@/lib/auth/server";
import { INQUIRY_STATUSES, type InquiryStatus } from "@/lib/domain/services";
import { INQUIRY_PAGE_SIZE, listInquiries } from "@/lib/services/inquiries";
import { cn } from "@/lib/utils";

/** Inquiries sent from the public pages. The layout and the service both require an owner. */
export default async function InquiriesPage({
  searchParams,
}: PageProps<"/[locale]/dashboard/services/inquiries">) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = INQUIRY_STATUSES.find((s) => s === raw) as InquiryStatus | undefined;
  const rawQ = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = (rawQ ?? "").trim().slice(0, 100);
  const rawPage = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const actor = await requireActorPage("/dashboard/services/inquiries");
  const [rows, t, tc] = await Promise.all([
    listInquiries(actor, status, { q, page }),
    getTranslations("servicesAdmin.inquiries"),
    getTranslations("servicesAdmin"),
  ]);
  const href = (p: number, s = status) => {
    const params = new URLSearchParams();
    if (s) params.set("status", s);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/dashboard/services/inquiries${qs ? `?${qs}` : ""}`;
  };
  const hasNext = rows.length === INQUIRY_PAGE_SIZE;
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
      <form method="get" role="search" className="flex gap-2">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <label htmlFor="inq-q" className="sr-only">
          {t("searchLabel")}
        </label>
        <input
          id="inq-q"
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder={t("searchPlaceholder")}
          className={cn(FIELD_CLASS, "max-w-sm")}
        />
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          {tc("list.apply")}
        </button>
      </form>
      <nav aria-label={t("filterLabel")}>
        <ul className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <li key={f.value ?? "all"}>
              <Link
                href={href(1, f.value)}
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
      {page > 1 || hasNext ? (
        <nav className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={href(page - 1)} className={buttonVariants({ variant: "outline" })}>
              {t("prev")}
            </Link>
          ) : (
            <span />
          )}
          {hasNext ? (
            <Link href={href(page + 1)} className={buttonVariants({ variant: "outline" })}>
              {t("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
