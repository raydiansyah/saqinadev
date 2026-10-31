/**
 * The local CLIs Saqina can use as a model, each with the exact command it is run with. Only
 * these binaries are ever started, with arguments built here; nothing from a person or a project
 * becomes part of the command line. The prompt goes in through stdin or a temporary file.
 */
export const CLI_IDS = ["claude", "codex", "opencode"] as const;
export type CliId = (typeof CLI_IDS)[number];

/** The model name that means "whatever the CLI is set to use". */
export const CLI_DEFAULT_MODEL = "default";

export interface CliRun {
  /** Arguments after the binary name. */
  args: string[];
  /** Text written to stdin, if the CLI reads its prompt there. */
  stdin?: string;
  /** Files created in the run's temporary directory before it starts. */
  files?: Record<string, string>;
  /** Reads the answer from what the process printed and from the files it wrote. */
  parse(out: { stdout: string; files: Record<string, string> }): {
    text: string;
    usage?: { input: number | null; output: number | null };
  };
  /** Files the process writes that `parse` reads. */
  outputs?: string[];
}

export interface CliDefinition {
  id: CliId;
  name: string;
  binary: string;
  versionArgs: string[];
  /** Models Saqina can offer without asking the CLI. `default` is always first. */
  models: string[];
  /** How a person logs the CLI in on the server. */
  loginHint: string;
  build(prompt: string, model: string): CliRun;
}

const modelArgs = (flag: string, model: string) =>
  model === CLI_DEFAULT_MODEL ? [] : [flag, model];

const stripAnsi = (s: string) =>
  s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");

export const CLI_DEFINITIONS: Record<CliId, CliDefinition> = {
  claude: {
    id: "claude",
    name: "Claude Code",
    binary: "claude",
    versionArgs: ["--version"],
    models: [CLI_DEFAULT_MODEL, "sonnet", "opus", "haiku"],
    loginHint: "claude auth login",
    build: (prompt, model) => ({
      // No tools: it answers, it cannot read or change files or run commands.
      args: [
        "-p",
        "--tools",
        "",
        "--no-session-persistence",
        "--output-format",
        "json",
        ...modelArgs("--model", model),
      ],
      stdin: prompt,
      parse: ({ stdout }) => {
        const json = JSON.parse(stdout) as {
          is_error?: boolean;
          result?: string;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        if (json.is_error || typeof json.result !== "string") throw new Error("cli_error");
        return {
          text: json.result,
          usage: {
            input: json.usage?.input_tokens ?? null,
            output: json.usage?.output_tokens ?? null,
          },
        };
      },
    }),
  },
  codex: {
    id: "codex",
    name: "Codex CLI",
    binary: "codex",
    versionArgs: ["--version"],
    models: [CLI_DEFAULT_MODEL],
    loginHint: "codex login",
    build: (prompt, model) => ({
      args: [
        "exec",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-user-config",
        "--output-last-message",
        "answer.txt",
        ...modelArgs("--model", model),
        "-",
      ],
      stdin: prompt,
      outputs: ["answer.txt"],
      parse: ({ files }) => {
        const text = files["answer.txt"];
        if (!text?.trim()) throw new Error("cli_error");
        return { text };
      },
    }),
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    binary: "opencode",
    versionArgs: ["--version"],
    models: [CLI_DEFAULT_MODEL],
    loginHint: "opencode auth login",
    build: (prompt, model) => ({
      // A long prompt does not fit one argument, so it is attached as a file.
      args: [
        "run",
        ...modelArgs("--model", model),
        "--file",
        "prompt.md",
        "Follow the instructions in the attached file and answer with the answer only.",
      ],
      files: { "prompt.md": prompt },
      parse: ({ stdout }) => {
        const text = stripAnsi(stdout).trim();
        if (!text) throw new Error("cli_error");
        return { text };
      },
    }),
  },
};

export const isCliId = (v: unknown): v is CliId =>
  typeof v === "string" && (CLI_IDS as readonly string[]).includes(v);
