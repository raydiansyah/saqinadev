import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { orgPageAccess } from "@/components/finance/page-access";
import { DataTable, TD, TH } from "@/components/finance/table";
import {
  ReminderRuleToggle,
  RunRemindersButton,
} from "@/components/notifications/reminder-controls";
import { requireActorPage } from "@/lib/auth/server";
import { REMINDER_KINDS, type ReminderAudience, type ReminderKind } from "@/lib/domain/business";
import { canOrg } from "@/lib/organizations/service";
import { orgRules, recentReminderLog } from "@/lib/reminders/service";
import { runRemindersAction, setReminderRuleAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reminders");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function RemindersPage() {
  const actor = await requireActorPage("/dashboard/reminders");
  const { org, role } = await orgPageAccess(actor, "billing:read");
  const canWrite = canOrg(role, "billing:write");
  const [rules, log, t, format] = await Promise.all([
    orgRules(org.id),
    recentReminderLog(actor),
    getTranslations("reminders"),
    getFormatter(),
  ]);

  /** "7 days before the due date, to the client" */
  const sentence = (kind: ReminderKind, offset: number, audience: ReminderAudience) => {
    const anchor = t(`anchors.${kind}`);
    const days = Math.abs(offset);
    const timing =
      offset < 0
        ? t("timing.before", { days, anchor })
        : offset === 0
          ? t("timing.onDay", { anchor })
          : t("timing.after", { days, anchor });
    return t("sentence", { timing, audience: t(`audience.${audience}`) });
  };

  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("description")}
        actions={canWrite ? <RunRemindersButton run={runRemindersAction} /> : undefined}
      />

      <section
        aria-labelledby="reminders-how"
        className="mb-10 rounded-lg border border-border bg-surface p-4 sm:p-5"
      >
        <h2 id="reminders-how" className="font-medium">
          {t("how.title")}
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>{t("how.daily")}</li>
          <li>{t("how.once")}</li>
          <li>{t("how.portal")}</li>
          <li>{t("how.email")}</li>
        </ul>
      </section>

      <section aria-labelledby="reminders-rules" className="mb-10">
        <h2 id="reminders-rules" className="mb-1 text-lg font-semibold">
          {t("rules.title")}
        </h2>
        {canWrite ? null : (
          <p className="mb-3 text-sm text-muted-foreground">{t("rules.readOnly")}</p>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {REMINDER_KINDS.map((kind) => {
            const group = rules.filter((r) => r.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind} className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium">{t(`kinds.${kind}`)}</h3>
                <ul className="mt-2 divide-y divide-border">
                  {group.map((rule) => {
                    const text = sentence(kind, rule.offsetDays, rule.audience);
                    return (
                      <li key={rule.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0 text-sm break-words">{text}</span>
                        <ReminderRuleToggle
                          id={rule.id}
                          enabled={rule.enabled}
                          label={t("rules.toggleLabel", { rule: text })}
                          disabled={!canWrite}
                          toggle={setReminderRuleAction}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="reminders-log">
        <h2 id="reminders-log" className="mb-4 text-lg font-semibold">
          {t("log.title")}
        </h2>
        {log.length === 0 ? (
          <EmptyState title={t("log.empty.title")} body={t("log.empty.body")} />
        ) : (
          <DataTable
            caption={t("log.caption")}
            head={
              <tr>
                <th scope="col" className={TH}>
                  {t("log.project")}
                </th>
                <th scope="col" className={TH}>
                  {t("log.kind")}
                </th>
                <th scope="col" className={TH}>
                  {t("log.when")}
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  {t("log.recipients")}
                </th>
              </tr>
            }
          >
            {log.map((row) => (
              <tr key={row.id}>
                <td className={TD}>{row.projectName ?? t("log.noProject")}</td>
                <td className={TD}>{t(`kinds.${row.kind}`)}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  <time dateTime={row.createdAt.toISOString()}>
                    {format.dateTime(row.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </td>
                <td className={`${TD} text-right tabular-nums`}>{row.recipients}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </>
  );
}
