import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createDefinition,
  definitionUsage,
  getDefinition,
  listDefinitions,
  setDefinitionStatus,
  updateDefinition,
} from "@/lib/agent-definitions/service";
import { assignAgentTx } from "@/lib/agents/orchestrator";
import { listAgentRegistry } from "@/lib/agents/registry";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  agentDefinitions,
  agentDefinitionVersions,
  agents,
  auditEvents,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { startExecution } from "@/lib/executions/service";
import { drainExecutions } from "@/lib/executions/worker";
import { createTask } from "@/lib/tasks/service";
import { createUser, resetDatabase } from "../helpers/db";
import { fakePlanner, PLAN, scripted } from "../helpers/engine";
import { project } from "../helpers/project";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

const config = (over: Record<string, unknown> = {}) => ({
  name: "Security Reviewer",
  role: "reviewer",
  description: "Checks changes for security problems.",
  instructions: "Review the change for missing access checks and unvalidated input.",
  responsibilities: ["Find security defects"],
  allowedScope: ["Review reports"],
  forbidden: ["Editing code"],
  inputRequirements: "The diff",
  expectedOutput: "Findings",
  definitionOfDone: ["Every file read"],
  modelId: null,
  tools: ["read_file", "report_task_result"],
  permissions: ["read_project", "read_repository"],
  skills: [],
  handoffTargets: [],
  maxAttempts: 2,
  timeoutMs: 120_000,
  priority: 1,
  ...over,
});

async function platformOwner(name = "Platform Owner"): Promise<Actor> {
  const actor = await createUser(name);
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, actor.id));
  return actor;
}

describe("agent definitions: who may manage them", () => {
  beforeEach(resetDatabase);

  it("seeds the starting team for an Owner, with identity and a job for each agent", async () => {
    const owner = await platformOwner();
    const list = await listDefinitions(owner);
    expect(list.map((d) => d.key).sort()).toEqual(
      [
        "architect",
        "backend-developer",
        "code-reviewer",
        "database-engineer",
        "devops-engineer",
        "docs-writer",
        "frontend-developer",
        "planner",
        "qa-engineer",
      ].sort(),
    );
    for (const d of list) {
      expect(d.instructions.length).toBeGreaterThan(40);
      expect(d.responsibilities.length).toBeGreaterThan(0);
      expect(d.definitionOfDone.length).toBeGreaterThan(0);
      expect(d.permissions).not.toContain("deploy");
      expect(d.tools).not.toContain("merge_branch");
    }
    expect((await listDefinitions(owner)).length).toBe(list.length);
  });

  it("refuses a signed-in user who is not the platform Owner, and changes nothing", async () => {
    const owner = await platformOwner();
    const [planner] = (await listDefinitions(owner)).filter((d) => d.key === "planner");
    const user = await createUser("Project Owner");
    await project(user, "An online shop selling handmade candles to local customers");

    expect(await code(listDefinitions(user))).toBe("AUTHORIZATION_ERROR");
    expect(await code(getDefinition(user, planner.id))).toBe("AUTHORIZATION_ERROR");
    expect(await code(createDefinition(user, { ...config(), key: "sneaky" }))).toBe(
      "AUTHORIZATION_ERROR",
    );
    expect(await code(updateDefinition(user, planner.id, config({ role: "planner" })))).toBe(
      "AUTHORIZATION_ERROR",
    );
    expect(await code(setDefinitionStatus(user, planner.id, "inactive"))).toBe(
      "AUTHORIZATION_ERROR",
    );

    const [after] = await db
      .select()
      .from(agentDefinitions)
      .where(eq(agentDefinitions.id, planner.id));
    expect(after.version).toBe(1);
    expect(after.status).toBe("active");
    expect(
      await db.select().from(agentDefinitions).where(eq(agentDefinitions.key, "sneaky")),
    ).toEqual([]);
  });

  it("lets the Owner create and change an agent, and keeps every version", async () => {
    const owner = await platformOwner();
    await listDefinitions(owner);
    const created = await createDefinition(owner, { ...config(), key: "security-reviewer" });
    expect(created.version).toBe(1);

    const updated = await updateDefinition(
      owner,
      created.id,
      config({
        tools: ["read_file"],
        instructions: "Review changes. Never approve a missing check.",
      }),
    );
    expect(updated.version).toBe(2);
    expect(updated.tools).toEqual(["read_file"]);

    // Saving the same configuration again is not a new version.
    expect(
      (
        await updateDefinition(
          owner,
          created.id,
          config({
            tools: ["read_file"],
            instructions: "Review changes. Never approve a missing check.",
          }),
        )
      ).version,
    ).toBe(2);

    const { versions } = await getDefinition(owner, created.id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0].changedFields.sort()).toEqual(["instructions", "tools"]);
  });

  it("audits who changed what without writing the instruction text", async () => {
    const owner = await platformOwner();
    await listDefinitions(owner);
    const created = await createDefinition(owner, { ...config(), key: "security-reviewer" });
    const secret = "Never reveal this internal wording";
    await updateDefinition(
      owner,
      created.id,
      config({ instructions: `${secret}. Review changes carefully.` }),
    );
    const rows = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.entityId, created.id), eq(auditEvents.type, "agent_definition.updated")),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBe(owner.id);
    expect(rows[0].metadata).toMatchObject({ changed: "instructions", version: 2 });
    expect(JSON.stringify(rows[0].metadata)).not.toContain(secret);
  });

  it("rejects what an agent must never be given", async () => {
    const owner = await platformOwner();
    await listDefinitions(owner);
    const bad = (over: Record<string, unknown>) =>
      code(createDefinition(owner, { ...config(), key: "bad-one", ...over }));
    expect(await bad({ tools: ["merge_branch"] })).toBe("VALIDATION_ERROR");
    expect(await bad({ tools: ["rm_rf"] })).toBe("VALIDATION_ERROR");
    expect(await bad({ permissions: ["deploy"] })).toBe("VALIDATION_ERROR");
    expect(await bad({ permissions: ["delete_project"] })).toBe("VALIDATION_ERROR");
    expect(await bad({ handoffTargets: ["nobody"] })).toBe("VALIDATION_ERROR");
    expect(await bad({ handoffTargets: ["bad-one"] })).toBe("VALIDATION_ERROR");
    expect(await bad({ status: "active" })).toBe("VALIDATION_ERROR");
    expect(await bad({ version: 9 })).toBe("VALIDATION_ERROR");
    expect(await bad({ maxAttempts: 50 })).toBe("VALIDATION_ERROR");
    expect(
      await db.select().from(agentDefinitions).where(eq(agentDefinitions.key, "bad-one")),
    ).toEqual([]);
  });

  it("refuses a second definition with the same key", async () => {
    const owner = await platformOwner();
    await listDefinitions(owner);
    await createDefinition(owner, { ...config(), key: "security-reviewer" });
    expect(await code(createDefinition(owner, { ...config(), key: "security-reviewer" }))).toBe(
      "CONFLICT",
    );
  });
});

describe("agent definitions: how projects use them", () => {
  beforeEach(resetDatabase);

  it("gives a project one agent per active definition without duplicating the template team", async () => {
    const owner = await platformOwner();
    const slug = await project(owner, "An online shop selling handmade candles to local customers");
    const access = await loadProjectAccess(owner, { slug }, "content:write");
    const { agents: team } = await listAgentRegistry(access);
    // The general-role "Saqina Dev" agent is a tool agent, not part of the specialist team.
    const saqina = team.filter((a) => a.type === "saqina" && a.role !== "general");
    expect(saqina).toHaveLength(9);
    expect(saqina.every((a) => a.definitionId)).toBe(true);
    expect(saqina.filter((a) => a.role === "planner")).toHaveLength(1);
    for (const a of saqina) {
      expect(a.permissions).not.toContain("deploy");
      expect(a.permissions).not.toContain("git_push");
    }
    await listAgentRegistry(access);
    const all = await db.select().from(agents).where(eq(agents.projectId, access.project.id));
    expect(all.filter((a) => a.type === "saqina" && a.role !== "general")).toHaveLength(9);
  });

  it("follows the definition's permissions when the Owner changes them", async () => {
    const owner = await platformOwner();
    const slug = await project(owner, "An online shop selling handmade candles to local customers");
    const access = await loadProjectAccess(owner, { slug }, "content:write");
    await listAgentRegistry(access);
    const [qa] = (await listDefinitions(owner)).filter((d) => d.key === "qa-engineer");
    await updateDefinition(owner, qa.id, {
      ...config({ name: qa.name, role: "qa", tools: ["read_file"], permissions: ["read_project"] }),
    });
    const { agents: team } = await listAgentRegistry(access);
    expect(team.find((a) => a.definitionId === qa.id)?.permissions).toEqual(["read_project"]);
  });

  it("does not give new tasks to an agent the Owner switched off, and resumes when it is on again", async () => {
    const owner = await platformOwner();
    const slug = await project(owner, "An online shop selling handmade candles to local customers");
    const access = await loadProjectAccess(owner, { slug }, "content:write");
    const { agents: team } = await listAgentRegistry(access);
    const backend = team.find((a) => a.role === "backend");
    if (!backend?.definitionId) throw new Error("backend agent has no definition");
    const task = await createTask(owner, slug, { title: "Build the checkout API" });
    const assign = () =>
      db.transaction((tx) =>
        assignAgentTx(
          tx,
          access,
          { taskId: task.id, agentId: backend.id, instructions: "Build it" },
          { via: "user" },
          new EventBatch(),
        ),
      );

    await setDefinitionStatus(owner, backend.definitionId, "inactive");
    expect(await code(assign())).toBe("VALIDATION_ERROR");
    await setDefinitionStatus(owner, backend.definitionId, "archived");
    expect(await code(assign())).toBe("VALIDATION_ERROR");
    await setDefinitionStatus(owner, backend.definitionId, "active");
    expect(await code(assign())).toBe("OK");

    const versions = await db
      .select()
      .from(agentDefinitionVersions)
      .where(eq(agentDefinitionVersions.definitionId, backend.definitionId));
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("what the Owner can see of the agents' work", () => {
  beforeEach(resetDatabase);

  it("shows counts per kind of agent across projects, to the Owner only, with no project text", async () => {
    const owner = await platformOwner();
    const slug = await project(owner, "An online shop selling handmade candles to local customers");
    const { provider } = fakePlanner(PLAN);
    const { executor } = scripted();
    await startExecution(owner, slug, {
      mode: "build",
      request: "Build the checkout page for the shop",
    });
    await drainExecutions({ provider, taskExecutor: executor });
    const defs = await listDefinitions(owner);
    const backend = defs.find((d) => d.key === "backend-developer");
    const planner = defs.find((d) => d.key === "planner");
    const usage = await definitionUsage(owner);
    expect(usage[backend?.id ?? ""]).toMatchObject({ runs: 1, succeeded: 1, failed: 0 });
    expect(usage[planner?.id ?? ""]).toMatchObject({ runs: 1, succeeded: 1 });
    // Numbers and a time, nothing from the project.
    expect(JSON.stringify(usage)).not.toContain("checkout");
    const user = await createUser("Project Owner");
    expect(await code(definitionUsage(user))).toBe("AUTHORIZATION_ERROR");
  });
});
