import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import {
  ListFilters,
  SORT_OPTIONS,
  STATUS_OPTIONS,
} from "@/components/services-admin/list-filters";
import { SeedButton } from "@/components/services-admin/seed-button";
import { ServiceTable } from "@/components/services-admin/service-table";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireActorPage } from "@/lib/auth/server";
import { SERVICE_CATEGORIES, type ServiceCategory } from "@/lib/domain/services";
import { listServices, type ServiceListQuery } from "@/lib/services/admin";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pick = <T extends string>(v: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/** Filters live in the URL: ?q=&category=&status=&sort=&page= */
export default async function ServicesPage({
  searchParams,
}: PageProps<"/[locale]/dashboard/services">) {
  const sp = (await searchParams) as Search;
  const q = one(sp.q).slice(0, 120);
  const category = pick<ServiceCategory | "">(one(sp.category), ["", ...SERVICE_CATEGORIES], "");
  const status = pick(one(sp.status), STATUS_OPTIONS, "all");
  const sort = pick(one(sp.sort), SORT_OPTIONS, "order");
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);

  const actor = await requireActorPage("/dashboard/services");
  const query: ServiceListQuery = {
    q,
    category: category || undefined,
    status,
    sort,
    page,
  };
  const [data, t] = await Promise.all([
    listServices(actor, query),
    getTranslations("servicesAdmin.list"),
  ]);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const filtered = Boolean(q || category || status !== "all");
  const href = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (status !== "all") params.set("status", status);
    if (sort !== "order") params.set("sort", sort);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return `/dashboard/services${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <ListFilters q={q} category={category} status={status} sort={sort} />
      {data.rows.length === 0 ? (
        filtered ? (
          <EmptyState title={t("emptyFiltered.title")} body={t("emptyFiltered.body")} />
        ) : (
          <EmptyState
            title={t("empty.title")}
            body={t("empty.body")}
            action={
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <SeedButton />
                <Link href="/dashboard/services/new" className={buttonVariants()}>
                  {t("empty.create")}
                </Link>
              </div>
            }
          />
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("count", { count: data.total })}</p>
          <ServiceTable
            rows={data.rows}
            canReorder={sort === "order" && status !== "archived"}
            offset={(data.page - 1) * data.pageSize}
            total={data.total}
          />
          {pages > 1 ? (
            <nav
              className="flex items-center justify-between gap-3"
              aria-label={t("pageOf", { page: data.page, pages })}
            >
              {data.page > 1 ? (
                <Link href={href(data.page - 1)} className={buttonVariants({ variant: "outline" })}>
                  {t("prev")}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted-foreground">
                {t("pageOf", { page: data.page, pages })}
              </span>
              {data.page < pages ? (
                <Link href={href(data.page + 1)} className={buttonVariants({ variant: "outline" })}>
                  {t("next")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
