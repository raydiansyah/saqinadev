import { getTranslations } from "next-intl/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { SERVICE_CATEGORIES } from "@/lib/domain/services";

export const STATUS_OPTIONS = ["all", "draft", "published", "hidden", "archived"] as const;
export const SORT_OPTIONS = ["order", "updated", "name"] as const;

/** Plain GET form: filters live in the URL and the list stays server-rendered. */
export async function ListFilters({
  q,
  category,
  status,
  sort,
}: {
  q: string;
  category: string;
  status: string;
  sort: string;
}) {
  const t = await getTranslations("servicesAdmin");
  return (
    <form
      method="get"
      role="search"
      aria-label={t("list.filtersLabel")}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end"
    >
      <Field
        id="svc-q"
        name="q"
        type="search"
        label={t("list.search")}
        placeholder={t("list.searchHint")}
        defaultValue={q}
        maxLength={120}
      />
      <Select id="svc-category" name="category" label={t("list.category")} defaultValue={category}>
        <option value="">{t("list.allCategories")}</option>
        {SERVICE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(`categories.${c}`)}
          </option>
        ))}
      </Select>
      <Select id="svc-status" name="status" label={t("list.status")} defaultValue={status}>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {t(`list.statusOptions.${s}`)}
          </option>
        ))}
      </Select>
      <Select id="svc-sort" name="sort" label={t("list.sort")} defaultValue={sort}>
        {SORT_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {t(`list.sortOptions.${s}`)}
          </option>
        ))}
      </Select>
      <div className="flex gap-2">
        <Button type="submit">{t("list.apply")}</Button>
        <Link href="/dashboard/services" className={buttonVariants({ variant: "ghost" })}>
          {t("list.reset")}
        </Link>
      </div>
    </form>
  );
}
