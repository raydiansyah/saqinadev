import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as z from "zod";
import { ADAPTERS } from "@/lib/ai/adapters";
import { CLI_DEFINITIONS } from "@/lib/ai/cli/definitions";
import { CliError, cliEnv, findBinary, runCli } from "@/lib/ai/cli/run";
import { connectCli, listClis, setCliEnabled } from "@/lib/ai/cli/service";
import {
  createProvider,
  disconnectProvider,
  listProviders,
  setDefaults,
  testProvider,
} from "@/lib/ai/control-plane";
import { runAi } from "@/lib/ai/gateway";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { aiModels, auditEvents, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { createUser, resetDatabase } from "../helpers/db";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError
      ? `${e.code}${e.fields ? `:${Object.values(e.fields)[0]}` : ""}`
      : String(e);
  }
};

let bin: string;
/** Where the fake CLI writes what it saw. The CLI's own environment is scrubbed, so the path is baked in. */
const LOG = () => join(bin, "log");
let owner: Actor;
let stranger: Actor;
const saved = {
  path: process.env.PATH,
  secret: process.env.BETTER_AUTH_SECRET,
};

/** A stand-in `claude`: it answers in Claude Code's JSON and records what it was given. */
const fakeClaude = (body: string) => {
  const file = join(bin, "claude");
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(file, 0o755);
};
const ANSWER = () => `
if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi
cat > "${LOG()}.stdin"
printf '%s\\n' "$*" > "${LOG()}.args"
printf '%s\\n' "$PWD" > "${LOG()}.cwd"
printf '%s\\n' "\${BETTER_AUTH_SECRET:-unset}" > "${LOG()}.env"
echo '{"is_error":false,"result":"Answer from the CLI","usage":{"input_tokens":7,"output_tokens":3}}'
`;

beforeAll(() => {
  bin = mkdtempSync(join(tmpdir(), "saqina-fake-cli-"));
  process.env.PATH = `${bin}:${saved.path}`;
});
afterAll(() => {
  process.env.PATH = saved.path;
  if (saved.secret === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = saved.secret;
});

beforeEach(async () => {
  await resetDatabase();
  process.env.BETTER_AUTH_SECRET = "a-server-secret-the-cli-must-not-see";
  fakeClaude(ANSWER());
  owner = await createUser("Owner");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
  stranger = await createUser("Stranger");
  // Off is the default; most tests need it on.
  await setCliEnabled(owner, { enabled: true });
});

describe("local CLI: only the platform Owner manages it", () => {
  it("refuses everyone else and creates nothing", async () => {
    expect(await code(listClis(stranger))).toBe("AUTHORIZATION_ERROR");
    expect(await code(connectCli(stranger, { cli: "claude" }))).toBe("AUTHORIZATION_ERROR");
    expect(
      await code(createProvider(owner, { name: "Sneaky", type: "custom", adapter: "local_cli" })),
    ).toBe("VALIDATION_ERROR:invalid");
    expect(await listProviders(owner)).toEqual([]);
  });

  it("is off by default, and only the Owner can switch it", async () => {
    await resetDatabase();
    owner = await createUser("Owner");
    await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
    stranger = await createUser("Stranger");
    const overview = await listClis(owner);
    expect(overview.enabled).toBe(false);
    expect(overview.clis.every((c) => !c.installed)).toBe(true);
    expect(await code(connectCli(owner, { cli: "claude" }))).toBe("VALIDATION_ERROR:cliOff");
    await expect(runCli("claude", "hi", "default")).rejects.toMatchObject({ code: "disabled" });

    expect(await code(setCliEnabled(stranger, { enabled: true }))).toBe("AUTHORIZATION_ERROR");
    expect((await listClis(owner)).enabled).toBe(false);
    expect(await code(setCliEnabled(owner, { enabled: "yes" }))).toBe("VALIDATION_ERROR:invalid");

    await setCliEnabled(owner, { enabled: true });
    expect((await listClis(owner)).enabled).toBe(true);
    expect((await listClis(owner)).clis.find((c) => c.id === "claude")?.installed).toBe(true);
    const audit = await db.select().from(auditEvents);
    expect(audit.map((a) => a.type)).toContain("provider.cli_enabled");
  });

  it("stops a connected CLI at once when switched off, and brings it back when switched on", async () => {
    const { id } = await connectCli(owner, { cli: "claude" });
    await testProvider(owner, { id });
    const [def] = await db.select().from(aiModels).where(eq(aiModels.modelId, "default"));
    await setDefaults(owner, { defaultModelId: def.id, fallbackModelId: null });
    const ask = () =>
      runAi({
        operation: "conversation",
        run: (client) =>
          client.generate({ system: "s", segments: [], userMessage: "u", draft: "rules" }),
      });
    expect((await ask()).value).toBe("Answer from the CLI");

    await setCliEnabled(owner, { enabled: false });
    // The provider still exists, but it cannot start the CLI, so the rules answer instead.
    expect((await ask()).deterministic).toBe(true);
    expect(await listProviders(owner)).toHaveLength(1);
    // Testing while it is off says so and leaves the provider's own state alone.
    expect(await testProvider(owner, { id })).toMatchObject({ ok: false, code: "cli_off" });
    expect((await listProviders(owner))[0].status).toBe("connected");
    const audit = await db.select().from(auditEvents);
    expect(audit.map((a) => a.type)).toContain("provider.cli_disabled");

    await setCliEnabled(owner, { enabled: true });
    expect((await ask()).value).toBe("Answer from the CLI");
  });
});

describe("local CLI: connect, test and use it without a key", () => {
  it("lists what is installed and connects it with its models, once", async () => {
    const before = await listClis(owner);
    expect(before.clis.find((c) => c.id === "claude")).toMatchObject({
      installed: true,
      version: "9.9.9 (Claude Code)",
      providerId: null,
    });
    expect(before.clis.find((c) => c.id === "codex")?.installed).toBe(false);
    expect(await code(connectCli(owner, { cli: "codex" }))).toBe(
      "VALIDATION_ERROR:cliNotInstalled",
    );

    const { id } = await connectCli(owner, { cli: "claude" });
    expect((await connectCli(owner, { cli: "claude" })).id).toBe(id);
    const providers = await listProviders(owner);
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({ adapter: "local_cli", hasCredential: true });
    const models = await db.select().from(aiModels).where(eq(aiModels.providerId, id));
    expect(models.map((m) => m.modelId).sort()).toEqual([...CLI_DEFINITIONS.claude.models].sort());
    const audit = await db.select().from(auditEvents).where(eq(auditEvents.entityId, id));
    expect(audit.map((a) => a.type)).toContain("provider.cli_connected");
  });

  it("tests the CLI and answers through the gateway with no stored key", async () => {
    const { id } = await connectCli(owner, { cli: "claude" });
    expect(await testProvider(owner, { id })).toMatchObject({ ok: true, code: "ok" });
    const [def] = await db.select().from(aiModels).where(eq(aiModels.modelId, "default"));
    await setDefaults(owner, { defaultModelId: def.id, fallbackModelId: null });

    const out = await runAi({
      operation: "conversation",
      run: (client) =>
        client.generate({
          system: "You are Saqina.",
          segments: [],
          userMessage: "Hello",
          draft: "d",
        }),
    });
    expect(out.value).toBe("Answer from the CLI");
    expect(out.deterministic).toBe(false);

    const log = LOG();
    const args = readFileSync(`${log}.args`, "utf8");
    // No tools, no saved session, and no model flag for the CLI's own default.
    expect(args).toContain("--tools");
    expect(args).toContain("--no-session-persistence");
    expect(args).not.toContain("--model");
    expect(readFileSync(`${log}.stdin`, "utf8")).toContain("Hello");
    // Its own empty folder, which is gone afterwards; and none of the server's secrets.
    const cwd = readFileSync(`${log}.cwd`, "utf8").trim();
    expect(cwd).toContain("saqina-cli-");
    expect(existsSync(cwd)).toBe(false);
    expect(readFileSync(`${log}.env`, "utf8").trim()).toBe("unset");
  });

  it("asks for a model by name only when it is not the CLI default", async () => {
    await runCli("claude", "hi", "opus");
    expect(readFileSync(`${LOG()}.args`, "utf8")).toContain("--model opus");
  });

  it("returns structured output, also when the CLI wraps it in a fence", async () => {
    fakeClaude(`
if [ "$1" = "--version" ]; then echo 1; exit 0; fi
cat > /dev/null
printf '%s' '{"is_error":false,"result":"Here you go:\\n\`\`\`json\\n{\\"title\\":\\"Plan\\"}\\n\`\`\`"}'
`);
    const client = ADAPTERS.local_cli.createClient(
      { baseUrl: null, configuration: { cli: "claude" } },
      "",
      "default",
    );
    const value = await client.generateObject(
      { system: "s", segments: [], userMessage: "u", draft: "" },
      z.object({ title: z.string() }),
      "plan",
    );
    expect(value).toEqual({ title: "Plan" });
  });

  it("fails honestly when the CLI answers nonsense, errors, or hangs", async () => {
    const client = ADAPTERS.local_cli.createClient(
      { baseUrl: null, configuration: { cli: "claude" } },
      "",
      "default",
    );
    fakeClaude(`
if [ "$1" = "--version" ]; then echo 1; exit 0; fi
cat > /dev/null
echo '{"is_error":false,"result":"no json here"}'
`);
    await expect(
      client.generateObject(
        { system: "s", segments: [], userMessage: "u", draft: "" },
        z.object({ a: z.string() }),
        "x",
      ),
    ).rejects.toMatchObject({ code: "bad_response" });

    fakeClaude(`
if [ "$1" = "--version" ]; then echo 1; exit 0; fi
echo "boom secret=hunter2" >&2
exit 3
`);
    const failed = await runCli("claude", "hi", "default").catch((e) => e);
    expect(failed).toBeInstanceOf(CliError);
    expect(failed.code).toBe("failed");
    expect(String(failed.message)).not.toContain("hunter2");

    fakeClaude(`
if [ "$1" = "--version" ]; then echo 1; exit 0; fi
sleep 30
`);
    await expect(runCli("claude", "hi", "default", { timeoutMs: 300 })).rejects.toMatchObject({
      code: "timeout",
    });
    const controller = new AbortController();
    const pending = runCli("claude", "hi", "default", { signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
  });

  it("is not used once disconnected, and the Owner can connect it again", async () => {
    const { id } = await connectCli(owner, { cli: "claude" });
    await testProvider(owner, { id });
    const [def] = await db.select().from(aiModels).where(eq(aiModels.modelId, "default"));
    await setDefaults(owner, { defaultModelId: def.id, fallbackModelId: null });
    await disconnectProvider(owner, { id });
    const [row] = await listProviders(owner);
    expect(row).toMatchObject({ status: "disconnected", hasCredential: false });
    const out = await runAi({
      operation: "conversation",
      run: async (client) =>
        client.generate({ system: "s", segments: [], userMessage: "u", draft: "rules" }),
    });
    // Nothing usable is left, so the rules answer.
    expect(out.deterministic).toBe(true);

    expect((await connectCli(owner, { cli: "claude" })).id).toBe(id);
    expect((await listProviders(owner))[0].status).toBe("untested");
  });
});

describe("local CLI: what the process may see", () => {
  it("passes the home and the search path but none of the server's secrets", () => {
    const env = cliEnv({
      HOME: "/home/x",
      PATH: "/usr/bin",
      DATABASE_URL: "postgres://secret",
      BETTER_AUTH_SECRET: "s",
      SAQINA_ENCRYPTION_KEY: "k",
      ANTHROPIC_API_KEY: "a",
    } as unknown as NodeJS.ProcessEnv);
    expect(env.HOME).toBe("/home/x");
    expect(env.PATH).toBe("/usr/bin");
    expect(Object.keys(env).join()).not.toMatch(/DATABASE|SECRET|KEY/);
    expect(findBinary("definitely-not-a-cli", bin)).toBeNull();
  });
});
