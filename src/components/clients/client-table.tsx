import { getTranslations } from "next-intl/server";
import { DataTable, TD, TH } from "@/components/finance/table";
import { Link } from "@/i18n/navigation";
import type { ClientListItem } from "@/lib/clients/service";
import { cn } from "@/lib/utils";

export async function ClientTable({ clients }: { clients: ClientListItem[] }) {
  const t = await getTranslations("clients");
  return (
    <DataTable
      caption={t("table.caption")}
      head={
        <tr>
          <th scope="col" className={TH}>
            {t("table.name")}
          </th>
          <th scope="col" className={TH}>
            {t("table.email")}
          </th>
          <th scope="col" className={TH}>
            {t("table.status")}
          </th>
          <th scope="col" className={`${TH} text-right`}>
            {t("table.projects")}
          </th>
          <th scope="col" className={`${TH} text-right`}>
            {t("table.portalUsers")}
          </th>
        </tr>
      }
    >
      {clients.map((c) => (
        <tr key={c.id} className={cn(c.status === "archived" && "text-subtle-foreground")}>
          <td className={TD}>
            <Link
              href={`/dashboard/clients/${c.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {c.name}
            </Link>
            {c.company ? (
              <p className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground">{c.company}</p>
            ) : null}
          </td>
          <td className={cn(TD, "max-w-56 truncate text-muted-foreground")}>{c.email}</td>
          <td className={TD}>
            <span
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-xs",
                c.status === "active"
                  ? "border-success/40 text-success"
                  : "border-border text-subtle-foreground",
              )}
            >
              {t(`statuses.${c.status}`)}
            </span>
          </td>
          <td className={cn(TD, "text-right tabular-nums")}>{c.projectCount}</td>
          <td className={cn(TD, "text-right tabular-nums")}>{c.portalUserCount}</td>
        </tr>
      ))}
    </DataTable>
  );
}
