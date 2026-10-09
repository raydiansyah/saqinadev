import { formatDay } from "@/components/finance/format";

/** Loose translator shape so message keys built from stored notification types type-check. */
export interface LooseT {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
}

export interface NotificationInput {
  type: string;
  params: Record<string, string>;
  projectName: string | null;
}

// Every param any message uses; missing ones render empty instead of failing the ICU format.
const EMPTY = {
  title: "",
  project: "",
  number: "",
  amount: "",
  due: "",
  end: "",
  name: "",
  author: "",
  status: "",
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Title and body for a stored notification. Types map to nested keys (`a.b` -> `types.a.b`);
 * an unknown type falls back to a generic "Project update" so old rows never break the list.
 */
export function renderNotification(
  t: LooseT,
  n: NotificationInput,
  locale: string,
): { title: string; body: string } {
  const project = n.params.project || n.projectName || "";
  const values: Record<string, string> = { ...EMPTY, ...n.params, project };
  for (const key of ["due", "end"] as const)
    if (ISO_DAY.test(values[key])) values[key] = formatDay(values[key], locale);
  if (values.status && t.has(`requestStatuses.${values.status}`))
    values.status = t(`requestStatuses.${values.status}`);

  const base = `types.${n.type}`;
  if (/^[a-z_]+(\.[a-z_]+)*$/.test(n.type) && t.has(`${base}.title`) && t.has(`${base}.body`))
    return { title: t(`${base}.title`, values), body: t(`${base}.body`, values) };
  return { title: t("generic.title"), body: project ? t("generic.body", values) : "" };
}
