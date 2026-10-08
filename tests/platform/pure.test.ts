import { describe, expect, it } from "vitest";
import { sign, verifySignature } from "@/lib/agents/external/adapters";
import { parseAgentResult } from "@/lib/agents/external/result";
import {
  type CatalogModel,
  DEFAULT_POLICY,
  resolveModel,
  validateMapping,
} from "@/lib/ai/model-resolver";
import { detectStack, stackMismatches } from "@/lib/git/stack";
import { isPrivateAddress } from "@/lib/net/endpoint-guard";
import { open, seal } from "@/lib/secrets/crypto";
import { containsSecret, scrubSecrets } from "@/lib/secrets/scan";
import { validateJson } from "@/lib/tools/json-schema";
import { decideTool } from "@/lib/tools/policy";

const KEY = { SAQINA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };

describe("secret encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const sealed = seal("sk-test-123", KEY);
    expect(sealed.ciphertext).not.toContain("sk-test");
    expect(open(sealed, KEY)).toBe("sk-test-123");
  });

  it("fails on tampering or the wrong key", () => {
    const sealed = seal("secret value", KEY);
    const flipped = Buffer.from(sealed.ciphertext, "base64");
    flipped[0] ^= 1;
    expect(() => open({ ...sealed, ciphertext: flipped.toString("base64") }, KEY)).toThrow();
    expect(() =>
      open(sealed, { SAQINA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") }),
    ).toThrow();
    expect(() => seal("x", {})).toThrow(/SAQINA_ENCRYPTION_KEY/);
  });

  it("scrubs key-shaped values", () => {
    const text = "token ghp_abcdefghijklmnopqrstuvwxyz0123 and sk-ant-abcdefghijklmnopqrstu";
    expect(containsSecret(text)).toBe(true);
    expect(scrubSecrets(text)).toBe("token [redacted] and [redacted]");
    expect(containsSecret("plain text with no keys")).toBe(false);
  });
});

const model = (id: string, extra: Partial<CatalogModel> = {}): CatalogModel => ({
  id,
  providerId: `p-${id}`,
  modelId: id,
  displayName: id,
  capabilities: ["text", "structured_output"],
  status: "available",
  providerName: "P",
  providerType: "managed",
  providerAdapter: "openai",
  providerEnabled: true,
  providerStatus: "connected",
  ...extra,
});

describe("model resolver", () => {
  const catalog = [
    model("a"),
    model("b"),
    model("c", { capabilities: ["text", "vision"] }),
    model("off", { status: "disabled" }),
  ];
  const platform = { defaultModelId: "a", fallbackModelId: "b", policy: DEFAULT_POLICY };

  it("orders agent override, project override, default, fallback", () => {
    const r = resolveModel({
      catalog,
      platform,
      project: { preferredModelId: "b", allowedModelIds: null, allowAgentOverrides: true },
      agentMappings: [{ primaryModelId: "c", fallbackModelId: null, requiredCapabilities: [] }],
    });
    expect(r.chain.map((c) => [c.model.id, c.source])).toEqual([
      ["c", "agent_override"],
      ["b", "project_override"],
      ["a", "platform_default"],
    ]);
  });

  it("skips unavailable models and enforces capabilities and policy", () => {
    const r = resolveModel({
      catalog,
      platform: { ...platform, defaultModelId: "off" },
      required: ["vision"],
    });
    expect(r.chain).toEqual([]);
    expect(r.rejected.map((x) => x.reason)).toEqual(["unavailable", "capability"]);
    const blocked = resolveModel({
      catalog,
      platform: { ...platform, policy: { ...DEFAULT_POLICY, allowedModelIds: ["b"] } },
    });
    expect(blocked.chain.map((c) => c.model.id)).toEqual(["b"]);
    const noOverride = resolveModel({
      catalog,
      platform: {
        ...platform,
        policy: { ...DEFAULT_POLICY, allowProjectOverride: false, allowAgentOverride: false },
      },
      project: { preferredModelId: "c", allowedModelIds: null, allowAgentOverrides: true },
      agentMappings: [{ primaryModelId: "c", fallbackModelId: null, requiredCapabilities: [] }],
    });
    expect(noOverride.chain[0].source).toBe("platform_default");
  });

  it("validates mappings against required capabilities", () => {
    expect(
      validateMapping(catalog, {
        primaryModelId: "a",
        fallbackModelId: null,
        requiredCapabilities: ["vision"],
      }),
    ).toMatchObject({
      ok: false,
      reason: "capability",
      missing: ["vision"],
    });
    expect(
      validateMapping(catalog, {
        primaryModelId: "c",
        fallbackModelId: null,
        requiredCapabilities: ["vision"],
      }).ok,
    ).toBe(true);
  });
});

describe("tool policy and schema", () => {
  const base = {
    role: "editor" as const,
    toolPermission: "read_repository" as const,
    trust: "enabled" as const,
  };
  it("covers the risk matrix", () => {
    expect(decideTool({ ...base, risk: "low" })).toEqual({ kind: "allow" });
    expect(decideTool({ ...base, risk: "high" })).toEqual({ kind: "approval" });
    expect(decideTool({ ...base, risk: "high", approved: true })).toEqual({ kind: "allow" });
    expect(decideTool({ ...base, risk: "critical", approved: true })).toMatchObject({
      kind: "deny",
      reason: "critical",
    });
    expect(decideTool({ ...base, risk: "low", trust: "discovered" })).toMatchObject({
      reason: "not_enabled",
    });
    expect(decideTool({ ...base, risk: "medium", role: "viewer" })).toMatchObject({
      reason: "role",
    });
    expect(decideTool({ ...base, risk: "low", agent: { permissions: [] } })).toMatchObject({
      reason: "agent_permission",
    });
    expect(
      decideTool({
        ...base,
        risk: "low",
        agent: { permissions: ["git_push"] },
        toolPermission: "git_push",
      }),
    ).toMatchObject({
      reason: "agent_permission",
    });
  });

  it("validates tool input", () => {
    const schema = {
      type: "object",
      properties: { path: { type: "string", maxLength: 5 }, n: { type: "integer", minimum: 1 } },
      required: ["path"],
      additionalProperties: false,
    };
    expect(validateJson(schema, { path: "a", n: 2 })).toEqual([]);
    expect(validateJson(schema, { n: 0, extra: 1 }).map((e) => e.message)).toEqual([
      "required",
      "too small",
      "unexpected",
    ]);
    expect(validateJson(schema, { path: "toolong" })[0].message).toBe("too long");
  });
});

describe("repository stack", () => {
  it("detects stacks from manifests and flags real mismatches only", () => {
    expect(detectStack({ "composer.json": '{"require":{"laravel/framework":"^11"}}' })).toEqual({
      backend: "Laravel",
    });
    const js = detectStack({
      "package.json": JSON.stringify({
        dependencies: { next: "16", react: "19", pg: "8", "better-auth": "1" },
      }),
    });
    expect(js).toEqual({
      frontend: "Next.js",
      backend: "Next.js",
      database: "PostgreSQL",
      auth: "Better Auth",
    });
    expect(
      stackMismatches(
        { backend: "Next.js", database: "Supabase (PostgreSQL)" },
        { backend: "Laravel", database: "PostgreSQL" },
      ),
    ).toEqual([{ key: "backend", project: "Next.js", repository: "Laravel" }]);
    expect(stackMismatches({ frontend: "Next.js" }, {})).toEqual([]);
  });
});

describe("outbound endpoints and webhooks", () => {
  it("classifies private addresses", () => {
    for (const ip of [
      "10.0.0.1",
      "127.0.0.1",
      "192.168.1.2",
      "172.20.0.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
    ])
      expect(isPrivateAddress(ip)).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("verifies webhook signatures and rejects replays", () => {
    const now = Date.now();
    const sig = sign("secret-123", String(now), "{}");
    expect(verifySignature("secret-123", String(now), "{}", sig, now)).toBe(true);
    expect(verifySignature("other", String(now), "{}", sig, now)).toBe(false);
    expect(verifySignature("secret-123", String(now), "{}", sig, now + 10 * 60_000)).toBe(false);
  });

  it("normalises agent results without inventing changes", () => {
    expect(parseAgentResult("All good")).toMatchObject({
      summary: "All good",
      changes: [],
      status: "completed",
    });
    expect(
      parseAgentResult('Report: {"status":"failed","summary":"Broke","issues":["x"]}'),
    ).toMatchObject({ status: "failed", issues: ["x"] });
  });
});
