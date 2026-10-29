import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import {
  addCustomConnector,
  addPresetConnector,
  connectConnector,
  listConnectors,
  removeConnector,
  setConnectorEnabled,
  setConnectorTool,
} from "@/lib/connectors/service";
import { db } from "@/lib/db/client";
import {
  auditEvents,
  credentials,
  mcpConnections,
  platformSkills,
  tools,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { listMcpConnections, listProjectTools } from "@/lib/mcp/service";
import {
  installSkillFromGithub,
  installSkillFromText,
  listPlatformSkills,
  platformSkillsFor,
  removePlatformSkill,
  updatePlatformSkill,
} from "@/lib/skills/service";
import { executeTool } from "@/lib/tools/executor";
import { startDevMcpServer } from "../../scripts/dev-mcp-server";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

const SKILL =
  "---\nname: tdd\ndescription: Write the failing test first.\n---\n\n# TDD\nRed, green, refactor.";
const TOKEN = "dev-mcp-token-1234";

let owner: Actor;
let member: Actor;
let slug: string;
let otherSlug: string;
let mcpServer: Server;
let endpoint: string;

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  member = await createUser("Member");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
  slug = await project(member, "Online shop for handmade soap");
  otherSlug = await project(owner, "Booking site for a barbershop");
  mcpServer = await startDevMcpServer(0, TOKEN);
  endpoint = `http://127.0.0.1:${(mcpServer.address() as AddressInfo).port}/mcp`;
});

afterAll(async () => {
  mcpServer?.close();
  await resetDatabase();
});

describe("platform skills", () => {
  it("only the platform owner manages them", async () => {
    await expectCode(listPlatformSkills(member), "AUTHORIZATION_ERROR");
    await expectCode(installSkillFromText(member, { content: SKILL }), "AUTHORIZATION_ERROR");
  });

  it("starts with Superpowers built in and switched on", async () => {
    const skills = await listPlatformSkills(owner);
    expect(skills.filter((s) => s.source === "builtin").map((s) => s.slug)).toEqual([
      "superpowers-brainstorming",
      "superpowers-writing-plans",
    ]);
    const forPrd = await platformSkillsFor("prd_generation");
    expect(forPrd.map((s) => s.slug)).toEqual(["superpowers-brainstorming"]);
    expect(forPrd[0].content).toContain("Brainstorming");
  });

  it("installs a pasted SKILL.md, refuses a duplicate, and audits without the text", async () => {
    const { id } = await installSkillFromText(owner, { content: SKILL, uses: ["agent_run"] });
    await expectCode(installSkillFromText(owner, { content: SKILL }), "CONFLICT");
    const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.entityId, id));
    expect(audit.type).toBe("skill.installed");
    expect(JSON.stringify(audit.metadata)).not.toContain("Red, green");
    expect((await platformSkillsFor("agent_run", "tdd test")).map((s) => s.slug)).toContain("tdd");
  });

  it("installs from GitHub through the raw URL only", async () => {
    const seen: string[] = [];
    await installSkillFromGithub(
      owner,
      { url: "https://github.com/acme/skills/tree/main/review" },
      async (url) => {
        seen.push(url);
        return SKILL.replace("name: tdd", "name: review");
      },
    );
    expect(seen).toEqual(["https://raw.githubusercontent.com/acme/skills/main/review/SKILL.md"]);
    await expectCode(
      installSkillFromGithub(owner, { url: "https://evil.example/SKILL.md" }, async () => SKILL),
      "VALIDATION_ERROR",
    );
  });

  it("a switched-off skill is offered to nothing; a built-in one cannot be removed", async () => {
    const skills = await listPlatformSkills(owner);
    const tdd = skills.find((s) => s.slug === "tdd");
    const builtin = skills.find((s) => s.source === "builtin");
    if (!tdd || !builtin) throw new Error("missing");
    await updatePlatformSkill(owner, { id: tdd.id, enabled: false });
    expect((await platformSkillsFor("agent_run", "tdd")).map((s) => s.slug)).not.toContain("tdd");
    await expectCode(removePlatformSkill(owner, { id: builtin.id }), "CONFLICT");
    await removePlatformSkill(owner, { id: tdd.id });
    expect(await db.select().from(platformSkills).where(eq(platformSkills.slug, "tdd"))).toEqual(
      [],
    );
  });
});

describe("platform connectors", () => {
  let connectorId: string;

  it("only the platform owner adds them; a required key is required", async () => {
    await expectCode(
      addPresetConnector(member, { preset: "firecrawl", secret: "k" }),
      "AUTHORIZATION_ERROR",
    );
    await expectCode(addPresetConnector(owner, { preset: "firecrawl" }), "VALIDATION_ERROR");
  });

  it("stores the key encrypted, never in the endpoint or the listing", async () => {
    ({ id: connectorId } = await addCustomConnector(owner, {
      name: "Dev MCP",
      endpoint,
      authType: "bearer",
      secret: TOKEN,
    }));
    const [row] = await db.select().from(mcpConnections).where(eq(mcpConnections.id, connectorId));
    expect(row.scope).toBe("platform");
    expect(row.projectId).toBeNull();
    expect(row.endpoint).not.toContain(TOKEN);
    const [cred] = await db
      .select()
      .from(credentials)
      .where(eq(credentials.id, row.credentialId ?? ""));
    expect(cred.scope).toBe("platform");
    expect(cred.ciphertext).not.toContain(TOKEN);
    expect(JSON.stringify(await listConnectors(owner))).not.toContain(TOKEN);
  });

  it("connects and turns on only the tools that change nothing", async () => {
    const result = await connectConnector(owner, { id: connectorId });
    expect(result).toMatchObject({ ok: true, tools: 3 });
    const [listed] = await listConnectors(owner);
    expect(Object.fromEntries(listed.tools.map((t) => [t.name, t.enabled]))).toEqual({
      echo: true,
      clock: true,
      write_note: false,
    });
  });

  it("every project gets the tools, shown as a platform connection, and can run them", async () => {
    const access = await loadProjectAccess(member, { slug }, "project:read");
    const projectTools = (await listProjectTools(access)).filter(
      (t) => t.connectionId === connectorId,
    );
    expect(projectTools.map((t) => [t.name, t.trust]).sort()).toEqual([
      ["clock", "enabled"],
      ["echo", "enabled"],
      ["write_note", "discovered"],
    ]);
    const connections = await listMcpConnections(access);
    expect(connections.find((c) => c.id === connectorId)?.platform).toBe(true);
    const run = await executeTool({
      access: await loadProjectAccess(member, { slug }, "content:write"),
      tool: `mcp:${connectorId}:echo`,
      input: { text: "hi" },
      actor: { kind: "member" },
      idempotencyKey: `echo-${Date.now()}`,
    });
    expect(run.status).toBe("succeeded");
    // A second project gets its own copy, audited against itself.
    const other = await loadProjectAccess(owner, { slug: otherSlug }, "project:read");
    expect((await listProjectTools(other)).some((t) => t.connectionId === connectorId)).toBe(true);
  });

  it("switched off, its tools stop answering in every project", async () => {
    await setConnectorEnabled(owner, { id: connectorId, enabled: false });
    await expectCode(
      executeTool({
        access: await loadProjectAccess(member, { slug }, "content:write"),
        tool: `mcp:${connectorId}:echo`,
        input: { text: "hi" },
        actor: { kind: "member" },
        idempotencyKey: `echo-off-${Date.now()}`,
      }),
      "VALIDATION_ERROR",
    );
    await setConnectorEnabled(owner, { id: connectorId, enabled: true });
  });

  it("the owner's call on one tool reaches every project", async () => {
    await setConnectorTool(owner, { id: connectorId, tool: "echo", enabled: false });
    const rows = await db
      .select({ trust: tools.trust })
      .from(tools)
      .where(and(eq(tools.connectionId, connectorId), eq(tools.name, "echo")));
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.trust === "disabled")).toBe(true);
  });

  it("removing it deletes the key and every project's copy", async () => {
    await removeConnector(owner, { id: connectorId });
    expect(await db.select().from(tools).where(eq(tools.connectionId, connectorId))).toEqual([]);
    const platformKeys = await db
      .select()
      .from(credentials)
      .where(eq(credentials.scope, "platform"));
    expect(platformKeys.length).toBeGreaterThan(0);
    expect(platformKeys.every((c) => c.revokedAt !== null)).toBe(true);
  });
});
