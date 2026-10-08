import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  activities,
  agents,
  decisions,
  documents,
  memories,
  milestones,
  projects,
  recommendations,
  requirements,
  tasks,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { completeInterview, getInterviewState, saveAnswers } from "@/lib/interviews/service";
import {
  deleteProject,
  listProjects,
  setProjectArchived,
  startProject,
  updateProjectGeneral,
} from "@/lib/projects/service";
import { createUser, resetDatabase } from "../helpers/db";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

const countRows = async (
  table:
    | typeof tasks
    | typeof requirements
    | typeof memories
    | typeof decisions
    | typeof agents
    | typeof documents
    | typeof milestones
    | typeof recommendations,
  projectId: string,
) => {
  const [row] = await db.select({ n: count() }).from(table).where(eq(table.projectId, projectId));
  return row.n;
};

let owner: Actor;
let stranger: Actor;

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  stranger = await createUser("Stranger");
});

afterAll(async () => {
  await resetDatabase();
});

const IDEA = "Saya ingin membuat POS untuk restoran kecil.";

async function answerRestaurant(slug: string) {
  await saveAnswers(owner, {
    slug,
    step: "audience",
    confirm: ["projectType"],
    patch: { projectType: "pos" },
  });
  await saveAnswers(owner, {
    slug,
    step: "review",
    patch: {
      audience: ["business-owners", "employees"],
      objective: "Manage sales and daily operations for a small restaurant.",
      features: ["auth", "pos", "inventory", "reports"],
      databaseNeed: "yes",
      databaseChoice: "recommend",
      developmentMode: "saqina",
      deployment: "saqina-vercel",
      details: {
        platforms: ["web"],
        authMethods: ["google", "email"],
        followUps: { tableManagement: "yes" },
        constraints: "",
      },
    },
  });
}

describe("starting a project", () => {
  it("creates a draft project, owner membership and an interview with inferred answers", async () => {
    const { slug } = await startProject(owner, { idea: IDEA }, "id");
    expect(slug).toMatch(/^pos-restoran-[a-z2-9]{4}$/);

    const state = await getInterviewState(owner, slug);
    expect(state.status).toBe("in_progress");
    expect(state.data.answers.projectDescription).toBe(IDEA);
    expect(state.data.answers.projectType).toBe("pos");
    // Classifier output is a suggestion until confirmed.
    expect(state.data.sources.projectType).toBe("inferred");

    const [list] = await listProjects(owner);
    expect(list).toMatchObject({ slug, status: "interview" });
    expect(list.nextAction.kind).toBe("continueInterview");
  });

  it("rejects an idea that is too short", async () => {
    await expectCode(startProject(owner, { idea: "POS" }, "en"), "VALIDATION_ERROR");
  });
});

describe("interview persistence", () => {
  it("saves answers progressively and resumes where the user left off", async () => {
    const { slug } = await startProject(owner, { idea: IDEA }, "en");
    await saveAnswers(owner, { slug, step: "features", patch: { audience: ["customers"] } });
    const state = await getInterviewState(owner, slug);
    expect(state.step).toBe("features");
    expect(state.data.answers.audience).toEqual(["customers"]);
    expect(state.data.sources.audience).toBeUndefined();
  });

  it("confirming an inferred answer turns it into a user answer", async () => {
    const { slug } = await startProject(owner, { idea: IDEA }, "en");
    await saveAnswers(owner, { slug, step: "project", patch: {}, confirm: ["projectType"] });
    expect((await getInterviewState(owner, slug)).data.sources.projectType).toBeUndefined();
  });

  it("rejects malformed and unknown answers at the boundary", async () => {
    const { slug } = await startProject(owner, { idea: IDEA }, "en");
    await expectCode(
      saveAnswers(owner, { slug, step: "project", patch: { projectType: "spaceship" } }),
      "VALIDATION_ERROR",
    );
    await expectCode(
      saveAnswers(owner, { slug, step: "project", patch: { isAdmin: true } }),
      "VALIDATION_ERROR",
    );
  });

  it("refuses to complete while a conflict is unresolved", async () => {
    const { slug } = await startProject(owner, { idea: IDEA }, "en");
    await saveAnswers(owner, {
      slug,
      step: "review",
      patch: {
        deployment: "saqina-vercel",
        details: { platforms: ["mobile"], authMethods: [], followUps: {}, constraints: "" },
      },
    });
    await expectCode(completeInterview(owner, slug), "CONFLICT");

    await saveAnswers(owner, {
      slug,
      step: "review",
      patch: { resolutions: { "platform-deploy": "mobile" } },
    });
    await expect(completeInterview(owner, slug)).resolves.toEqual({ slug });
  });
});

describe("creating the workspace", () => {
  it("creates requirements, PRD, plan, tasks, memory, decisions and agents in one go", async () => {
    const { slug } = await startProject(owner, { idea: IDEA }, "en");
    await answerRestaurant(slug);
    await completeInterview(owner, slug);

    const { project } = await loadProjectAccess(owner, { slug }, "project:read");
    expect(project).toMatchObject({
      name: "Restaurant POS",
      status: "planning",
      buildStrategy: "saqina",
    });

    expect(await countRows(requirements, project.id)).toBeGreaterThan(8);
    expect(await countRows(documents, project.id)).toBe(2);
    expect(await countRows(milestones, project.id)).toBe(3);
    expect(await countRows(tasks, project.id)).toBeGreaterThanOrEqual(6);
    expect(await countRows(memories, project.id)).toBeGreaterThanOrEqual(5);
    expect(await countRows(decisions, project.id)).toBe(4);
    expect(await countRows(agents, project.id)).toBe(9);
    expect(await countRows(recommendations, project.id)).toBeGreaterThanOrEqual(6);

    const [prd] = await db.select().from(documents).where(eq(documents.slug, "prd"));
    expect(prd.content).toContain("## 18. Acceptance Criteria");
    expect(prd.content).toContain("Google");

    const unknown = await db
      .select({ title: requirements.title })
      .from(requirements)
      .where(eq(requirements.status, "unknown"));
    expect(unknown.length).toBeGreaterThan(0);

    const types = (await db.select({ type: activities.type }).from(activities)).map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(["project.created", "interview.completed"]));

    // Completing twice is a no-op, not a duplicate workspace.
    await completeInterview(owner, slug);
    expect(await countRows(documents, project.id)).toBe(2);
    await expectCode(
      saveAnswers(owner, { slug, step: "review", patch: { objective: "Changed after the fact" } }),
      "CONFLICT",
    );
  });

  it("writes Indonesian documents for Indonesian projects", async () => {
    const { slug } = await startProject(owner, { idea: IDEA }, "id");
    await answerRestaurant(slug);
    await completeInterview(owner, slug);
    const { project } = await loadProjectAccess(owner, { slug }, "project:read");
    expect(project.name).toBe("POS Restoran");
    const [prd] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, project.id), eq(documents.slug, "prd")));
    expect(prd.content).toContain("Kriteria Penerimaan");
  });
});

describe("authorization", () => {
  it("hides another user's project as not found and blocks every operation", async () => {
    const { slug } = await startProject(owner, { idea: IDEA }, "en");
    await expectCode(getInterviewState(stranger, slug), "NOT_FOUND");
    await expectCode(
      saveAnswers(stranger, { slug, step: "project", patch: { objective: "Hijacked" } }),
      "NOT_FOUND",
    );
    await expectCode(completeInterview(stranger, slug), "NOT_FOUND");
    await expectCode(
      updateProjectGeneral(stranger, slug, { name: "Mine now", description: "" }),
      "NOT_FOUND",
    );
    await expectCode(setProjectArchived(stranger, slug, true), "NOT_FOUND");
    await expectCode(deleteProject(stranger, slug, "Restaurant POS"), "NOT_FOUND");
    expect(await listProjects(stranger)).toEqual([]);
  });
});

describe("project lifecycle", () => {
  it("updates, archives, restores to the previous status and deletes only with the exact name", async () => {
    const { slug } = await startProject(owner, { idea: IDEA }, "en");
    await updateProjectGeneral(owner, slug, {
      name: "Warung POS",
      description: "Cashier for our warung",
    });

    await setProjectArchived(owner, slug, true);
    expect(await listProjects(owner)).toHaveLength(0);
    expect(await listProjects(owner, { archived: true })).toHaveLength(1);

    await setProjectArchived(owner, slug, false);
    const [restored] = await listProjects(owner);
    expect(restored).toMatchObject({ name: "Warung POS", status: "interview", archived: false });

    await expectCode(deleteProject(owner, slug, "warung pos"), "VALIDATION_ERROR");
    await deleteProject(owner, slug, "Warung POS");
    expect(await db.select().from(projects)).toHaveLength(0);
  });
});
