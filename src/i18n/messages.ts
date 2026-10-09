import type { Locale } from "./locales";

/**
 * Messages are split per area so each file stays reviewable; top-level namespaces never
 * overlap. The landing page and legal pages live in the base file.
 */
const LOADERS: Record<Locale, () => Promise<Record<string, unknown>[]>> = {
  en: () =>
    Promise.all([
      import("../../messages/en.json"),
      import("../../messages/auth.en.json"),
      import("../../messages/app.en.json"),
      import("../../messages/project.en.json"),
      import("../../messages/workspace.en.json"),
      import("../../messages/assistant.en.json"),
      import("../../messages/platform.en.json"),
      import("../../messages/billing.en.json"),
      import("../../messages/portal.en.json"),
      import("../../messages/clients.en.json"),
    ]).then((files) => files.map((f) => f.default)),
  id: () =>
    Promise.all([
      import("../../messages/id.json"),
      import("../../messages/auth.id.json"),
      import("../../messages/app.id.json"),
      import("../../messages/project.id.json"),
      import("../../messages/workspace.id.json"),
      import("../../messages/assistant.id.json"),
      import("../../messages/platform.id.json"),
      import("../../messages/billing.id.json"),
      import("../../messages/portal.id.json"),
      import("../../messages/clients.id.json"),
    ]).then((files) => files.map((f) => f.default)),
};

export async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  return Object.assign({}, ...(await LOADERS[locale]()));
}
