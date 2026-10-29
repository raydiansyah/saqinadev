import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadCatalog } from "@/lib/ai/catalog";
import { listProviders, setPolicy } from "@/lib/ai/control-plane";
import { runAi } from "@/lib/ai/gateway";
import { DEFAULT_POLICY } from "@/lib/ai/model-resolver";
import {
  addMyGateway,
  chatModelOptions,
  listMyGateways,
  removeMyGateway,
} from "@/lib/ai/user-gateway";
import type { StreamEvent } from "@/lib/assistant/blocks";
import { handleMessage } from "@/lib/assistant/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  aiProviders,
  credentials,
  messages,
  projectMembers,
  projects,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { withSecret } from "@/lib/secrets/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

// Fake keys, built at run time so no key-shaped literal sits in the repository.
const KEY_A = ["fake", "key", "user", "a", "0123456789"].join("-");
const KEY_WRONG = ["fake", "key", "wrong", "0123456789"].join("-");
let owner: Actor;
let alice: Actor;
let bob: Actor;
let slug: string;

type Call = { url: string; auth: string | null; body: string | null };
const calls: Call[] = [];
/** A stand-in for api.openai.com: the key decides what is answered. */
let chatStatus = 200;
const openai = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const auth = headers.authorization ?? null;
  calls.push({ url, auth, body: init?.body ? String(init.body) : null });
  if (auth !== `Bearer ${KEY_A}`) return new Response("{}", { status: 401 });
  if (url.endsWith("/models"))
    return Response.json({ data: [{ id: "gpt-4o" }, { id: "text-embedding-3-small" }] });
  if (chatStatus !== 200) return new Response("{}", { status: chatStatus });
  return Response.json({ choices: [{ message: { content: "Answer from my own model." } }] });
});

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  alice = await createUser("Alice");
  bob = await createUser("Bob");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
  slug = await project(alice, "Online shop for handmade soap");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const stub = () => {
  calls.length = 0;
  chatStatus = 200;
  vi.stubGlobal("fetch", openai);
};

const ask = async (actor: Actor, modelId?: string) => {
  const access = await loadProjectAccess(actor, { slug }, "project:read");
  return runAi({
    access,
    operation: "conversation",
    required: ["text"],
    userModelId: modelId,
    run: (client) => client.generate({ system: "s", segments: [], userMessage: "hi", draft: "" }),
  });
};

describe("a person's own AI gateway", () => {
  it("checks the key first: a refused key is never stored", async () => {
    stub();
    await expectCode(
      addMyGateway(alice, { name: "Mine", adapter: "openai", secret: KEY_WRONG }),
      "VALIDATION_ERROR",
    );
    expect(await db.select().from(credentials).where(eq(credentials.userId, alice.id))).toEqual([]);
  });

  it("adds it with the chat models the key can see, key sealed and never returned", async () => {
    stub();
    await addMyGateway(alice, { name: "Mine", adapter: "openai", secret: KEY_A });
    const mine = await listMyGateways(alice);
    expect(mine.gateways).toHaveLength(1);
    expect(mine.gateways[0].models.map((m) => m.modelId)).toEqual(["gpt-4o"]);
    expect(JSON.stringify(mine)).not.toContain(KEY_A);
    const [cred] = await db.select().from(credentials).where(eq(credentials.userId, alice.id));
    expect(cred).toMatchObject({ scope: "user", kind: "ai_provider" });
    expect(cred.ciphertext).not.toContain(KEY_A);
    expect((await chatModelOptions(alice)).map((o) => o.label)).toEqual(["Mine / gpt-4o"]);
  });

  it("belongs to that person alone: others and the platform never see it", async () => {
    expect((await listMyGateways(bob)).gateways).toEqual([]);
    expect(await chatModelOptions(bob)).toEqual([]);
    expect((await listProviders(owner)).map((p) => p.name)).not.toContain("Mine");
    expect((await loadCatalog()).filter((m) => m.ownerUserId)).toEqual([]);
    const [row] = await db.select().from(aiProviders).where(eq(aiProviders.ownerUserId, alice.id));
    await expectCode(removeMyGateway(bob, { id: row.id }), "NOT_FOUND");
    // The key opens for its owner only.
    const id = row.credentialId as string;
    await expectCode(
      withSecret(id, { kind: "ai_provider", userId: bob.id }, async () => 1),
      "NOT_FOUND",
    );
    expect(await withSecret(id, { kind: "ai_provider", userId: alice.id }, async (s) => s)).toBe(
      KEY_A,
    );
  });

  it("answers with the person's own model and says so", async () => {
    stub();
    const [model] = await chatModelOptions(alice);
    const out = await ask(alice, model.id);
    expect(out.value).toBe("Answer from my own model.");
    expect(out.source).toBe("user_choice");
    expect(out.actual.label).toBe("Mine / gpt-4o");
    expect(calls.every((c) => c.auth === `Bearer ${KEY_A}`)).toBe(true);
  });

  it("someone else cannot use it by its id: rules answer and no key is sent", async () => {
    stub();
    const [model] = await chatModelOptions(alice);
    // Bob is a member of the project, so the chat would run for him; the model is still not his.
    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    await db.insert(projectMembers).values({ projectId: p.id, userId: bob.id, role: "editor" });
    const out = await ask(bob, model.id);
    expect(out.source).toBe("rules");
    expect(calls).toEqual([]);
  });

  it("when the person's own model fails nothing else is asked: rules answer with the reasons", async () => {
    stub();
    chatStatus = 500;
    const [model] = await chatModelOptions(alice);
    const out = await ask(alice, model.id);
    expect(out.source).toBe("rules");
    expect(out.diagnostics.failed.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.auth === `Bearer ${KEY_A}`)).toBe(true);
  });

  it("the chat carries the choice end to end", async () => {
    stub();
    const [model] = await chatModelOptions(alice);
    const events: StreamEvent[] = [];
    await handleMessage(
      alice,
      slug,
      {
        clientId: randomUUID(),
        content: "How is the project going?",
        locale: "en",
        fresh: true,
        modelId: model.id,
      },
      (e) => events.push(e),
    );
    const sent = calls.filter((c) => c.url.endsWith("/chat/completions"));
    expect(sent.length).toBeGreaterThan(0);
    const replies = await db.select().from(messages);
    const reply = replies.find((m) => m.role === "assistant");
    expect(JSON.stringify(reply?.metadata)).toContain("Mine / gpt-4o");
  });

  it("follows the platform policy: with outside providers off it cannot be added or used", async () => {
    stub();
    const [model] = await chatModelOptions(alice);
    await setPolicy(owner, { ...DEFAULT_POLICY, allowExternalProviders: false });
    await expectCode(
      addMyGateway(alice, { name: "Second", adapter: "openai", secret: KEY_A }),
      "AUTHORIZATION_ERROR",
    );
    expect(await chatModelOptions(alice)).toEqual([]);
    calls.length = 0;
    const out = await ask(alice, model.id);
    expect(out.source).toBe("rules");
    expect(calls).toEqual([]);
    await setPolicy(owner, DEFAULT_POLICY);
  });

  it("removing it revokes the key and the models go with it", async () => {
    const [row] = await db.select().from(aiProviders).where(eq(aiProviders.ownerUserId, alice.id));
    await removeMyGateway(alice, { id: row.id });
    expect((await listMyGateways(alice)).gateways).toEqual([]);
    const [cred] = await db.select().from(credentials).where(eq(credentials.userId, alice.id));
    expect(cred.revokedAt).not.toBeNull();
  });
});
