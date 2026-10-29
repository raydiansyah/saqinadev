import type { ServiceKind, ServiceProvider } from "@/lib/domain/enums";

/**
 * The databases and sign-in services a project's app can use. They are always the user's own
 * accounts: Saqina provides none and only keeps the keys, encrypted, for this project.
 */

export interface ServiceVarSpec {
  name: string;
  /** A secret is never shown again and goes to Vercel as a sensitive variable. */
  secret: boolean;
  /** Checked on the way in; the value itself is never echoed. */
  check?: "postgres_url" | "http_url" | "clerk_publishable" | "clerk_secret";
}

export interface ServicePreset {
  id: ServiceProvider;
  kind: ServiceKind;
  name: string;
  docsUrl: string;
  vars: ServiceVarSpec[];
}

export const SERVICE_PRESETS: ServicePreset[] = [
  {
    id: "neon",
    kind: "database",
    name: "Neon",
    docsUrl: "https://neon.com/docs/guides/branching-intro",
    vars: [{ name: "DATABASE_URL", secret: true, check: "postgres_url" }],
  },
  {
    id: "supabase",
    kind: "database",
    name: "Supabase",
    docsUrl: "https://supabase.com/docs/guides/platform/branching",
    vars: [
      { name: "DATABASE_URL", secret: true, check: "postgres_url" },
      { name: "NEXT_PUBLIC_SUPABASE_URL", secret: false, check: "http_url" },
      { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", secret: false },
      { name: "SUPABASE_SERVICE_ROLE_KEY", secret: true },
    ],
  },
  {
    id: "clerk",
    kind: "auth",
    name: "Clerk",
    docsUrl: "https://clerk.com/docs/deployments/overview",
    vars: [
      { name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", secret: false, check: "clerk_publishable" },
      { name: "CLERK_SECRET_KEY", secret: true, check: "clerk_secret" },
    ],
  },
  {
    id: "postgres",
    kind: "database",
    name: "Postgres",
    docsUrl: "https://www.postgresql.org/docs/current/libpq-connect.html",
    vars: [{ name: "DATABASE_URL", secret: true, check: "postgres_url" }],
  },
];

export const presetFor = (provider: ServiceProvider) =>
  SERVICE_PRESETS.find((p) => p.id === provider) ?? null;

/** Variable names for a custom service: upper snake case, like environment variables. */
export const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

const URL_CHECKS = {
  postgres_url: /^postgres(ql)?:\/\/\S+$/i,
  http_url: /^https?:\/\/\S+$/i,
  clerk_publishable: /^pk_(test|live)_\S+$/,
  clerk_secret: /^sk_(test|live)_\S+$/,
} as const;

/** Whether a value has the right shape for its variable. */
export const valueFits = (check: ServiceVarSpec["check"], value: string) =>
  !check || URL_CHECKS[check].test(value);

export const isDatabaseVar = (name: string) => name === "DATABASE_URL";
