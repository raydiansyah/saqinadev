import type app from "../messages/app.en.json";
import type assistant from "../messages/assistant.en.json";
import type auth from "../messages/auth.en.json";
import type billing from "../messages/billing.en.json";
import type clients from "../messages/clients.en.json";
import type en from "../messages/en.json";
import type engagement from "../messages/engagement.en.json";
import type notify from "../messages/notify.en.json";
import type platform from "../messages/platform.en.json";
import type portal from "../messages/portal.en.json";
import type portalEngagement from "../messages/portal-engagement.en.json";
import type project from "../messages/project.en.json";
import type workspace from "../messages/workspace.en.json";
import type { routing } from "./i18n/routing";

// Type-safe message keys and locales for next-intl.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof en &
      typeof auth &
      typeof app &
      typeof project &
      typeof workspace &
      typeof assistant &
      typeof platform &
      typeof billing &
      typeof portal &
      typeof clients &
      typeof engagement &
      typeof portalEngagement &
      typeof notify;
  }
}
