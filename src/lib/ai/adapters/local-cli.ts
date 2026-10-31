import * as z from "zod";
import { CLI_DEFAULT_MODEL, CLI_DEFINITIONS, type CliId, isCliId } from "../cli/definitions";
import { CliError, cliEnabled, detectClis, runCli } from "../cli/run";
import { DATA_BOUNDARY_RULES, renderUserTurn } from "../prompt";
import type { AiProvider, AiRequest, AiUsage } from "../provider";
import { AiProviderError, type ProviderErrorCode } from "./http";
import type { AdapterConfig, ProviderAdapter } from "./types";

const CODE: Record<string, ProviderErrorCode> = {
  timeout: "timeout",
  not_installed: "not_found",
  disabled: "not_found",
  aborted: "network",
  failed: "provider_error",
};

const asProviderError = (e: unknown) =>
  e instanceof CliError ? new AiProviderError(CODE[e.code] ?? "provider_error") : e;

export const cliOf = (config: AdapterConfig): CliId => {
  const id = config.configuration.cli;
  if (!isCliId(id)) throw new AiProviderError("not_found");
  return id;
};

/** A CLI has no system-prompt flag in common, so the rules and the question are one prompt. */
function promptOf(req: AiRequest, extra = ""): string {
  const history = (req.history ?? []).map((m) => `${m.role}: ${m.content}`).join("\n\n");
  return [
    req.system,
    DATA_BOUNDARY_RULES,
    "Answer the request below with text only. You have no tools: do not try to read files or run commands.",
    history ? `Conversation so far:\n${history}` : "",
    renderUserTurn(req),
    extra,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The first balanced {...} or [...] in a reply, so a fenced or chatty answer still parses. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  for (const candidate of [text.trim(), fenced?.trim()]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next form.
    }
  }
  const start = text.search(/[{[]/);
  if (start >= 0) {
    for (let end = text.length; end > start; end--) {
      const c = text[end - 1];
      if (c !== "}" && c !== "]") continue;
      try {
        return JSON.parse(text.slice(start, end));
      } catch {
        // Shorten and try again.
      }
    }
  }
  return undefined;
}

class CliClient implements AiProvider {
  readonly deterministic = false;
  readonly config;
  usage?: AiUsage;

  constructor(
    private readonly cli: CliId,
    model: string,
  ) {
    this.config = { provider: "anthropic" as const, model };
  }

  private async ask(req: AiRequest, extra = ""): Promise<string> {
    try {
      const out = await runCli(this.cli, promptOf(req, extra), this.config.model, {
        signal: req.signal,
      });
      this.usage = out.usage;
      return out.text;
    } catch (e) {
      throw asProviderError(e);
    }
  }

  generate(req: AiRequest) {
    return this.ask(req);
  }

  /** A CLI answers when it is done; the whole text arrives as one piece. */
  async *stream(req: AiRequest) {
    yield await this.ask(req);
  }

  async generateObject<T>(req: AiRequest, schema: z.ZodType<T>, name: string): Promise<T> {
    const shape = JSON.stringify(z.toJSONSchema(schema, { target: "draft-7" }));
    const extra = `Return the "${name}" result as one JSON value that matches this JSON Schema, and nothing else (no prose, no code fence):\n${shape}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const parsed = schema.safeParse(extractJson(await this.ask(req, extra)));
      if (parsed.success) return parsed.data;
    }
    throw new AiProviderError("bad_response");
  }
}

/**
 * A CLI that is logged in on the server's own machine, used as a model. There is no key: the
 * CLI's own login does the work. It exists only when the server's operator switched local CLIs
 * on, and only the Owner can connect one.
 */
export const localCliAdapter: ProviderAdapter = {
  id: "local_cli",
  defaultBaseUrl: null,
  requiresBaseUrl: false,
  createClient: (config, _secret, model) => new CliClient(cliOf(config), model),
  async test(config) {
    if (!(await cliEnabled())) return { ok: false, code: "not_found" };
    const id = cliOf(config);
    const found = (await detectClis()).find((c) => c.id === id);
    if (!found?.installed) return { ok: false, code: "not_found" };
    try {
      const reply = await runCli(id, "Reply with the single word: pong", CLI_DEFAULT_MODEL, {
        timeoutMs: 90_000,
      });
      return reply.text.trim()
        ? { ok: true, code: "ok", models: CLI_DEFINITIONS[id].models }
        : { ok: false, code: "bad_response" };
    } catch (e) {
      const error = asProviderError(e);
      return { ok: false, code: error instanceof AiProviderError ? error.code : "provider_error" };
    }
  },
};
