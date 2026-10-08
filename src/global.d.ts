import type app from "../messages/app.en.json";
import type auth from "../messages/auth.en.json";
import type en from "../messages/en.json";
import type project from "../messages/project.en.json";
import type workspace from "../messages/workspace.en.json";
import type { routing } from "./i18n/routing";

// Type-safe message keys and locales for next-intl.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof en & typeof auth & typeof app & typeof project & typeof workspace;
  }
}
