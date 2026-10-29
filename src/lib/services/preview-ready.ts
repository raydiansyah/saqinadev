import type { ServiceVarConfig } from "@/lib/db/schema";
import type { ServiceProvider } from "@/lib/domain/enums";

/**
 * Whether a project that uses a database or sign-in service can be previewed: the preview must
 * have its own values (not production's), so a preview never writes to real data. Pure, so the
 * rule is the same in the server check and in the tests.
 */

export type ReadinessIssue =
  | { code: "missingProduction"; service: string; name: string }
  | { code: "missingPreview"; service: string; name: string }
  | { code: "previewSameAsProduction"; service: string; name: string }
  | { code: "clerkLiveKeyInPreview"; service: string; name: string };

export interface ServiceValues {
  provider: ServiceProvider;
  label: string;
  vars: ServiceVarConfig[];
  production: Record<string, string>;
  preview: Record<string, string>;
}

/** Variables whose value must differ between production and preview. */
const MUST_DIFFER = (provider: ServiceProvider, name: string) =>
  name === "DATABASE_URL" ||
  (provider === "supabase" && name === "NEXT_PUBLIC_SUPABASE_URL") ||
  (provider === "clerk" && name === "CLERK_SECRET_KEY");

export function previewIssues(services: ServiceValues[]): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  for (const s of services) {
    const service = `${s.provider}:${s.label}`;
    for (const v of s.vars) {
      const prod = s.production[v.name];
      const prev = s.preview[v.name];
      if (!prod) issues.push({ code: "missingProduction", service, name: v.name });
      if (!prev) {
        issues.push({ code: "missingPreview", service, name: v.name });
        continue;
      }
      if (prod && prod === prev && MUST_DIFFER(s.provider, v.name))
        issues.push({ code: "previewSameAsProduction", service, name: v.name });
      if (s.provider === "clerk" && /^(pk|sk)_live_/.test(prev))
        issues.push({ code: "clerkLiveKeyInPreview", service, name: v.name });
    }
  }
  return issues;
}
