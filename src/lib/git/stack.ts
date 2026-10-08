import type { StackKey } from "@/lib/domain/enums";

/**
 * Reads the stack from manifest files at the repository root. Pure: the caller fetches only
 * the manifests that exist. Values are canonical names ("Next.js", "Laravel", ...).
 */
export const MANIFESTS = [
  "package.json",
  "composer.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "Cargo.toml",
] as const;

export type DetectedStack = Partial<Record<StackKey, string>>;

const JS_FRONTEND: [string, string][] = [
  ["next", "Next.js"],
  ["nuxt", "Nuxt"],
  ["@sveltejs/kit", "SvelteKit"],
  ["astro", "Astro"],
  ["@remix-run/react", "Remix"],
  ["vue", "Vue"],
  ["react", "React"],
];
const JS_BACKEND: [string, string][] = [
  ["next", "Next.js"],
  ["@nestjs/core", "NestJS"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["hono", "Hono"],
];
const JS_DB: [string, string][] = [
  ["pg", "PostgreSQL"],
  ["postgres", "PostgreSQL"],
  ["@supabase/supabase-js", "Supabase (PostgreSQL)"],
  ["mysql2", "MySQL"],
  ["mongodb", "MongoDB"],
  ["mongoose", "MongoDB"],
  ["better-sqlite3", "SQLite"],
];
const JS_AUTH: [string, string][] = [
  ["better-auth", "Better Auth"],
  ["next-auth", "Auth.js"],
  ["@auth/core", "Auth.js"],
  ["@clerk/nextjs", "Clerk"],
  ["@supabase/auth-helpers-nextjs", "Supabase Auth"],
];

const firstDep = (deps: Record<string, string>, table: [string, string][]) =>
  table.find(([dep]) => dep in deps)?.[1];

export function detectStack(
  files: Partial<Record<(typeof MANIFESTS)[number], string>>,
): DetectedStack {
  const out: DetectedStack = {};
  if (files["package.json"]) {
    try {
      const pkg = JSON.parse(files["package.json"]) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.devDependencies, ...pkg.dependencies };
      out.frontend = firstDep(deps, JS_FRONTEND);
      out.backend = firstDep(deps, JS_BACKEND);
      out.database = firstDep(deps, JS_DB);
      out.auth = firstDep(deps, JS_AUTH);
    } catch {
      // A broken package.json is reported as "unknown", not guessed.
    }
  }
  if (files["composer.json"]) {
    const text = files["composer.json"];
    if (/"laravel\/framework"/.test(text)) out.backend = "Laravel";
    else if (/"symfony\/framework-bundle"/.test(text)) out.backend = "Symfony";
    else out.backend ??= "PHP";
  }
  const py = `${files["requirements.txt"] ?? ""}\n${files["pyproject.toml"] ?? ""}`;
  if (py.trim()) {
    if (/\bdjango\b/i.test(py)) out.backend = "Django";
    else if (/\bfastapi\b/i.test(py)) out.backend = "FastAPI";
    else if (/\bflask\b/i.test(py)) out.backend = "Flask";
    if (/psycopg|asyncpg/i.test(py)) out.database ??= "PostgreSQL";
  }
  if (files["go.mod"]) out.backend ??= "Go";
  if (files.Gemfile && /\brails\b/.test(files.Gemfile)) out.backend = "Ruby on Rails";
  if (files["pom.xml"] || files["build.gradle"])
    out.backend ??= /spring/i.test(`${files["pom.xml"]}${files["build.gradle"]}`)
      ? "Spring Boot"
      : "Java";
  if (files["Cargo.toml"]) out.backend ??= "Rust";
  for (const key of Object.keys(out) as StackKey[]) if (!out[key]) delete out[key];
  return out;
}

const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Same technology, ignoring punctuation and qualifiers ("Supabase (PostgreSQL)" ⊇ "PostgreSQL"). */
export function sameTech(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  return x === y || x.includes(y) || y.includes(x);
}

export interface StackMismatch {
  key: StackKey;
  project: string;
  repository: string;
}

/** Only fields both sides know about can mismatch; unknown is not a conflict. */
export function stackMismatches(
  project: Partial<Record<StackKey, string>>,
  repo: DetectedStack,
): StackMismatch[] {
  const out: StackMismatch[] = [];
  for (const key of ["frontend", "backend", "database", "auth"] as const) {
    const p = project[key];
    const r = repo[key];
    if (p && r && !sameTech(p, r)) out.push({ key, project: p, repository: r });
  }
  return out;
}
