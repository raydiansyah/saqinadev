import "server-only";
import { spawn } from "node:child_process";
import { accessSync, constants, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { platformSettings } from "../catalog";
import { CLI_DEFINITIONS, type CliId } from "./definitions";

/**
 * Local CLIs run commands on the machine that serves Saqina, so they are off until the platform
 * Owner switches them on (AI & Models > Providers). Read on every call: switching off takes effect
 * at once, for providers that already exist.
 */
export async function cliEnabled(): Promise<boolean> {
  return (await platformSettings()).localCliEnabled;
}

const MAX_OUTPUT = 4 * 1024 * 1024;
export const CLI_TIMEOUT_MS = 180_000;

export type CliFailure = "disabled" | "not_installed" | "timeout" | "failed" | "aborted";

export class CliError extends Error {
  constructor(readonly code: CliFailure) {
    super(code);
  }
}

/**
 * What the CLI process may see. It needs the person's home (that is where its login lives) and the
 * search path; it never gets the database URL, Saqina's keys or any other server secret.
 */
const SAFE_ENV = [
  "HOME",
  "USERPROFILE",
  "PATH",
  "LANG",
  "LC_ALL",
  "TERM",
  "TMPDIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "CODEX_HOME",
  "CLAUDE_CONFIG_DIR",
  "OPENCODE_CONFIG_DIR",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "NO_PROXY",
  "SSL_CERT_FILE",
  "NODE_EXTRA_CA_CERTS",
];

export function cliEnv(source = process.env): NodeJS.ProcessEnv {
  const env: Record<string, string> = { NO_COLOR: "1", CI: "1" };
  for (const key of SAFE_ENV) {
    const value = source[key];
    if (value) env[key] = value;
  }
  return env as NodeJS.ProcessEnv;
}

/** The first executable called `binary` on the search path, or null. */
export function findBinary(binary: string, searchPath = process.env.PATH ?? ""): string | null {
  for (const dir of searchPath.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, binary);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not here.
    }
  }
  return null;
}

interface Finished {
  code: number | null;
  stdout: string;
}

function execute(
  file: string,
  args: string[],
  options: { cwd: string; stdin?: string; timeoutMs: number; signal?: AbortSignal },
): Promise<Finished> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new CliError("aborted"));
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: cliEnv(),
      stdio: ["pipe", "pipe", "ignore"],
      shell: false,
    });
    let stdout = "";
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const stop = (error: CliError) => {
      child.kill("SIGKILL");
      done(() => reject(error));
    };
    const onAbort = () => stop(new CliError("aborted"));
    const timer = setTimeout(() => stop(new CliError("timeout")), options.timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > MAX_OUTPUT) stop(new CliError("failed"));
    });
    child.on("error", () => done(() => reject(new CliError("failed"))));
    child.on("close", (code) => done(() => resolve({ code, stdout })));
    child.stdin.on("error", () => {});
    child.stdin.end(options.stdin ?? "");
  });
}

export interface CliStatus {
  id: CliId;
  name: string;
  installed: boolean;
  version: string | null;
  loginHint: string;
  models: string[];
}

/** Which of the supported CLIs are installed on this server, and their versions. */
export async function detectClis(searchPath = process.env.PATH ?? ""): Promise<CliStatus[]> {
  return Promise.all(
    Object.values(CLI_DEFINITIONS).map(async (def) => {
      const file = findBinary(def.binary, searchPath);
      let version: string | null = null;
      if (file) {
        const cwd = mkdtempSync(join(tmpdir(), "saqina-cli-"));
        try {
          const out = await execute(file, def.versionArgs, { cwd, timeoutMs: 15_000 });
          version =
            out.stdout
              .split("\n")
              .map((l) => l.trim())
              .find(Boolean)
              ?.slice(0, 80) ?? null;
        } catch {
          version = null;
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      }
      return {
        id: def.id,
        name: def.name,
        installed: Boolean(file),
        version,
        loginHint: def.loginHint,
        models: def.models,
      };
    }),
  );
}

export interface CliResult {
  text: string;
  usage?: { input: number | null; output: number | null };
}

/**
 * Asks a CLI one question. Each call runs in a new empty directory, so the CLI sees no project
 * files, and the directory is deleted afterwards. It is stopped when the time is up or the caller
 * aborts. Only a failure code ever leaves this function, never what the process printed.
 */
export async function runCli(
  id: CliId,
  prompt: string,
  model: string,
  options: { timeoutMs?: number; signal?: AbortSignal; searchPath?: string } = {},
): Promise<CliResult> {
  if (!(await cliEnabled())) throw new CliError("disabled");
  const def = CLI_DEFINITIONS[id];
  const file = findBinary(def.binary, options.searchPath);
  if (!file) throw new CliError("not_installed");
  const run = def.build(prompt, model);
  const cwd = mkdtempSync(join(tmpdir(), "saqina-cli-"));
  try {
    for (const [name, content] of Object.entries(run.files ?? {}))
      writeFileSync(join(cwd, name), content, { mode: 0o600 });
    const finished = await execute(file, run.args, {
      cwd,
      stdin: run.stdin,
      timeoutMs: options.timeoutMs ?? CLI_TIMEOUT_MS,
      signal: options.signal,
    });
    if (finished.code !== 0) throw new CliError("failed");
    const files: Record<string, string> = {};
    for (const name of run.outputs ?? []) {
      try {
        files[name] = readFileSync(join(cwd, name), "utf8");
      } catch {
        // Missing output is reported by parse.
      }
    }
    try {
      return run.parse({ stdout: finished.stdout, files });
    } catch {
      throw new CliError("failed");
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
