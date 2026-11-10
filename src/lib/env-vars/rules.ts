import { ENV_NAME } from "@/lib/services/presets";

/**
 * The rules for the variables a person sets on a project's app, as pure functions so the server and
 * the tests apply the same ones. Nothing here sees a value it should keep: callers hand values in and
 * take decisions out.
 */

/** Set by the platform the app runs on, so a person never needs to (or may) set them. */
const PROVIDED = /^(NODE_ENV|VERCEL|VERCEL_.*|NEXT_RUNTIME|PORT|CI|SAQINA_HOSTED|GIT_COMMIT_SHA)$/;

export const ENVIRONMENTS = ["production", "preview", "development"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export type NameProblem = "invalid" | "reserved";

export function nameProblem(name: string): NameProblem | null {
  if (!ENV_NAME.test(name)) return "invalid";
  if (PROVIDED.test(name)) return "reserved";
  return null;
}

/** Anything named NEXT_PUBLIC_ is built into the browser bundle, so it is never a secret. */
export const isPublicName = (name: string) => name.startsWith("NEXT_PUBLIC_");

export const MAX_VALUE = 4000;
export const MAX_IMPORT = 100;

export interface ParsedEnv {
  entries: Array<{ name: string; value: string }>;
  /** Lines that were not a variable: the line number and why, never the value. */
  invalid: Array<{ line: number; reason: "syntax" | "invalid" | "reserved" | "too_long" }>;
}

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/** Reads the text of a .env file the way dotenv does for the cases people actually paste. */
export function parseDotenv(text: string): ParsedEnv {
  const byName = new Map<string, string>();
  const invalid: ParsedEnv["invalid"] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim() || /^\s*#/.test(raw)) return;
    const m = LINE.exec(raw);
    if (!m) return void invalid.push({ line: i + 1, reason: "syntax" });
    const [, name, rest] = m;
    let value: string;
    const first = rest[0];
    if (first === '"' || first === "'") {
      const end = rest.indexOf(first, 1);
      value = end < 0 ? rest.slice(1) : rest.slice(1, end);
      if (first === '"')
        value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    } else {
      value = rest.replace(/\s+#.*$/, "").trim();
    }
    const problem = nameProblem(name);
    if (problem) return void invalid.push({ line: i + 1, reason: problem });
    if (value.length > MAX_VALUE) return void invalid.push({ line: i + 1, reason: "too_long" });
    byName.set(name, value);
  });
  return { entries: [...byName].map(([name, value]) => ({ name, value })), invalid };
}

export interface EnvVarValues {
  name: string;
  secret: boolean;
  production: string;
  preview: string;
  development: string;
}

/** The value a developer's machine uses: its own, else the preview's. Never the production one. */
export const localValueOf = (v: EnvVarValues): string => v.development || v.preview;

export interface DeployVar {
  key: string;
  value: string;
  secret: boolean;
  target: Environment;
}

/** One entry per name and environment that has a value. A public name is never sent as a secret. */
export function deployVars(vars: readonly EnvVarValues[]): DeployVar[] {
  const out: DeployVar[] = [];
  for (const v of vars) {
    const secret = v.secret && !isPublicName(v.name);
    for (const target of ["production", "preview"] as const)
      if (v[target]) out.push({ key: v.name, value: v[target], secret, target });
    const local = localValueOf(v);
    if (local) out.push({ key: v.name, value: local, secret, target: "development" });
  }
  return out;
}
