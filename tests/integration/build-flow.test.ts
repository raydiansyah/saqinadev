import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { resolutionInput } from "@/lib/ai/catalog";
import { createModel, createProvider, setDefaults, setPolicy } from "@/lib/ai/control-plane";
import { resolveModel } from "@/lib/ai/model-resolver";
import { agentModelChoice, setAgentModel } from "@/lib/ai/project-settings";
import type { AiProvider, AiRequest } from "@/lib/ai/provider";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  agentAssignments,
  agentModelMappings,
  agentRuns,
  agents,
  documents,
  projectMembers,
  projects,
  proposals,
  users,
} from "@/lib/db/schema";
import { setDocumentStatus } from "@/lib/documents/service";
import { AppError } from "@/lib/errors";
import { refineAfterInterview } from "@/lib/interviews/ai-intelligence";
import { enhancePrdSection, getPrdBrief, savePrdBrief } from "@/lib/prd/service";
import { startProject, updateProjectGeneral } from "@/lib/projects/service";
import { approveProposal } from "@/lib/proposals/service";
import { startBuilding } from "@/lib/studio/kickoff";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

/** A model stand-in: `generate` answers by what is asked, `generateObject` with a title. */
function fakeModel(answers: { text?: (r: AiRequest) => string; title?: string }) {
  const seen: AiRequest[] = [];
  const p = {
    deterministic: false,
    config: { provider: "mock" as const, model: "fake-model" },
    generate: async (r: AiRequest) => {
      seen.push(r);
      return answers.text?.(r) ?? "";
    },
    stream: async function* () {},
    generateObject: async (r: AiRequest) => {
      seen.push(r);
      return { title: answers.title ?? "" };
    },
  };
  return { provider: p as unknown as AiProvider, seen };
}

let owner: Actor;
let viewer: Actor;
let stranger: Actor;

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  viewer = await createUser("Viewer");
  stranger = await createUser("Stranger");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
});

const addViewer = async (slug: string) => {
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
  await db.insert(projectMembers).values({ projectId: p.id, userId: viewer.id, role: "viewer" });
};

describe("project name follows the plan", () => {
  it("is named from the idea, then renamed by the plan until a person names it", async () => {
    const { slug } = await startProject(
      owner,
      { idea: "Online shop for handmade soap and candles" },
      "en",
    );
    const [created] = await db.select().from(projects).where(eq(projects.slug, slug));
    expect(created.nameSource).toBe("auto");
    await updateProjectGeneral(owner, slug, {
      name: "Soap & Co",
      description: created.description,
    });
    const [renamed] = await db.select().from(projects).where(eq(projects.slug, slug));
    expect(renamed.nameSource).toBe("user");
  });

  it("after the interview a model names the project; the slug never changes", async () => {
    const slug = await project(owner, "Booking site for a barbershop with online payments");
    const { provider } = fakeModel({ title: "Barber Booker" });
    const result = await refineAfterInterview(owner, slug, { provider });
    expect(result.renamed).toBe(true);
    const [row] = await db.select().from(projects).where(eq(projects.slug, slug));
    expect(row.name).toBe("Barber Booker");
    expect(row.slug).toBe(slug);
  });

  it("a name a person chose is kept", async () => {
    const slug = await project(owner, "Inventory tracker for a small warehouse");
    const [row] = await db.select().from(projects).where(eq(projects.slug, slug));
    await updateProjectGeneral(owner, slug, { name: "Stockroom", description: row.description });
    const { provider } = fakeModel({ title: "Something Else" });
    await refineAfterInterview(owner, slug, { provider });
    const [after] = await db.select().from(projects).where(eq(projects.slug, slug));
    expect(after.name).toBe("Stockroom");
  });
});

describe("Superpowers refinement after the interview", () => {
  it("proposes the refined PRD and plan from the planner, written with the skills", async () => {
    const slug = await project(owner, "Learning platform for piano lessons");
    const refined = (r: AiRequest) => {
      const draft = r.segments.find((s) => s.label.startsWith("draft "));
      return `${draft?.content.trim()}\n\n## Refined\n\nMore detail.\n`;
    };
    const { provider, seen } = fakeModel({ text: refined, title: "Piano Path" });
    const result = await refineAfterInterview(owner, slug, { provider });
    expect(result.proposals).toBe(1);
    const skillLabels = seen.flatMap((r) => r.segments.map((s) => s.label));
    expect(skillLabels).toContain("skill:superpowers-brainstorming");
    expect(skillLabels).toContain("skill:superpowers-writing-plans");

    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    const [proposal] = await db.select().from(proposals).where(eq(proposals.projectId, p.id));
    expect(proposal.status).toBe("pending");
    // Nothing changed before approval.
    const before = await db
      .select({ slug: documents.slug, version: documents.version })
      .from(documents)
      .where(eq(documents.projectId, p.id));
    expect(
      before.filter((d) => d.slug === "prd" || d.slug === "plan").map((d) => d.version),
    ).toEqual([1, 1]);

    await approveProposal(owner, slug, { proposalId: proposal.id });
    const [prd] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, p.id), eq(documents.slug, "prd")));
    expect(prd.version).toBe(2);
    expect(prd.content).toContain("## Refined");
  });

  it("with no model set up nothing changes", async () => {
    const slug = await project(owner, "Recipe sharing site for home cooks");
    const result = await refineAfterInterview(owner, slug);
    expect(result).toEqual({ renamed: false, proposals: 0 });
  });

  it("a stranger cannot trigger it", async () => {
    const slug = await project(owner, "Event tickets for small venues");
    await expectCode(refineAfterInterview(stranger, slug), "NOT_FOUND");
  });
});

describe("Generate PRD", () => {
  let slug: string;
  beforeAll(async () => {
    slug = await project(owner, "Online shop for handmade soap");
    await addViewer(slug);
  });

  it("fills the form from the current PRD", async () => {
    const view = await getPrdBrief(await loadProjectAccess(owner, { slug }, "project:read"));
    expect(view.source).toBe("prd");
    expect(view.baseVersion).toBe(1);
    expect(view.brief.sections.length).toBeGreaterThan(5);
  });

  it("Enhance uses the rules without a model, and the model with brainstorming when there is one", async () => {
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const { brief } = await getPrdBrief(access);
    brief.sections[0].body = "Pay by card\nPay by card\nRefunds";
    const rules = await enhancePrdSection(owner, slug, { brief, index: 0 });
    expect(rules).toEqual({
      body: "- Pay by card\n- Refunds",
      deterministic: true,
      model: "rules",
    });

    const { provider, seen } = fakeModel({ text: () => "## Overview\n\nA specific overview." });
    const model = await enhancePrdSection(owner, slug, { brief, index: 0 }, { provider });
    expect(model).toMatchObject({ body: "A specific overview.", deterministic: false });
    expect(seen[0].segments.map((s) => s.label)).toContain("skill:superpowers-brainstorming");
  });

  it("saves a new version that needs approval again, and refuses a stale one", async () => {
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    await setDocumentStatus(owner, slug, { docSlug: "prd", status: "approved" });
    const { brief, baseVersion } = await getPrdBrief(access);
    brief.title = "Soap shop PRD";
    const { version } = await savePrdBrief(owner, slug, { brief, baseVersion });
    expect(version).toBe(2);
    const [prd] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, access.project.id), eq(documents.slug, "prd")));
    expect(prd.content.startsWith("# Soap shop PRD")).toBe(true);
    expect(prd.status).not.toBe("approved");
    await expectCode(savePrdBrief(owner, slug, { brief, baseVersion }), "CONFLICT");
  });

  it("writes the first PRD when there is none", async () => {
    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    await db.delete(documents).where(and(eq(documents.projectId, p.id), eq(documents.slug, "prd")));
    const brief = { title: "New PRD", sections: [{ heading: "Overview", body: "A shop." }] };
    expect(await savePrdBrief(owner, slug, { brief, baseVersion: null })).toEqual({ version: 1 });
    await expectCode(savePrdBrief(owner, slug, { brief, baseVersion: null }), "CONFLICT");
  });

  it("a viewer cannot save or enhance; a stranger gets NOT_FOUND", async () => {
    const brief = { title: "X PRD", sections: [{ heading: "Overview", body: "x" }] };
    await expectCode(savePrdBrief(viewer, slug, { brief, baseVersion: 1 }), "AUTHORIZATION_ERROR");
    await expectCode(enhancePrdSection(viewer, slug, { brief, index: 0 }), "AUTHORIZATION_ERROR");
    await expectCode(savePrdBrief(stranger, slug, { brief, baseVersion: 1 }), "NOT_FOUND");
    await expectCode(enhancePrdSection(owner, slug, { brief, index: 5 }), "VALIDATION_ERROR");
  });
});

describe("agent model choice", () => {
  let slug: string;
  let modelId: string;
  beforeAll(async () => {
    slug = await project(owner, "Online shop for handmade soap");
    await addViewer(slug);
    const provider = await createProvider(owner, {
      name: "Local",
      type: "custom",
      adapter: "openai_compatible",
      baseUrl: "http://127.0.0.1:9/v1",
      secret: "dev-key-1234567890",
    });
    modelId = (
      await createModel(owner, {
        providerId: provider.id,
        modelId: "local-model",
        displayName: "Local model",
        capabilities: ["text", "structured_output", "streaming"],
      })
    ).id;
    await setDefaults(owner, { defaultModelId: modelId, fallbackModelId: null });
  });

  it("offers only models that are set up, with Automatic naming today's pick", async () => {
    const choice = await agentModelChoice(await loadProjectAccess(owner, { slug }, "project:read"));
    expect(choice.options.map((o) => o.id)).toContain(modelId);
    expect(choice.automatic).toBe("Local / Local model");
    expect(choice.current.saqina ?? null).toBeNull();
  });

  it("pinning a model for Saqina is what every Saqina agent then runs", async () => {
    await setAgentModel(owner, slug, { type: "saqina", modelId });
    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    const team = await db
      .select()
      .from(agents)
      .where(and(eq(agents.projectId, p.id), eq(agents.type, "saqina")));
    const maps = await db
      .select()
      .from(agentModelMappings)
      .where(eq(agentModelMappings.projectId, p.id));
    expect(maps.length).toBe(team.length);
    const planner = team.find((a) => a.role === "planner");
    if (!planner) throw new Error("no planner");
    const input = await resolutionInput({
      projectId: p.id,
      agent: { id: planner.id, role: planner.role },
    });
    expect(resolveModel({ ...input, required: [] }).chain[0]?.source).toBe("agent_override");
    await setAgentModel(owner, slug, { type: "saqina", modelId: null });
    expect(
      await db.select().from(agentModelMappings).where(eq(agentModelMappings.projectId, p.id)),
    ).toEqual([]);
  });

  it("an outside agent records the model as its preference", async () => {
    await setAgentModel(owner, slug, { type: "claude", modelId });
    const choice = await agentModelChoice(await loadProjectAccess(owner, { slug }, "project:read"));
    expect(choice.current.claude).toBe(modelId);
  });

  it("refuses unknown models, a locked policy, viewers and strangers", async () => {
    await expectCode(
      setAgentModel(owner, slug, {
        type: "saqina",
        modelId: "00000000-0000-4000-8000-000000000000",
      }),
      "VALIDATION_ERROR",
    );
    await expectCode(
      setAgentModel(viewer, slug, { type: "saqina", modelId }),
      "AUTHORIZATION_ERROR",
    );
    await expectCode(setAgentModel(stranger, slug, { type: "saqina", modelId }), "NOT_FOUND");
    await setPolicy(owner, {
      allowedProviderIds: null,
      allowedModelIds: null,
      allowProjectOverride: true,
      allowAgentOverride: false,
      allowExternalProviders: true,
    });
    await expectCode(
      setAgentModel(owner, slug, { type: "saqina", modelId }),
      "AUTHORIZATION_ERROR",
    );
  });
});

describe("Start building", () => {
  it("hands every open task to a fitting team agent once, when Saqina builds", async () => {
    const slug = await project(owner, "Online shop for handmade soap");
    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    expect(p.buildStrategy).toBe("saqina");
    const first = await startBuilding(owner, slug);
    expect(first.mode).toBe("agents");
    expect(first.started).toBeGreaterThan(0);
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.projectId, p.id));
    expect(runs.length).toBe(first.started);
    // Clicking again never doubles a task that already has an agent.
    const assigned = await db
      .select()
      .from(agentAssignments)
      .where(eq(agentAssignments.projectId, p.id));
    const second = await startBuilding(owner, slug);
    const after = await db
      .select()
      .from(agentAssignments)
      .where(eq(agentAssignments.projectId, p.id));
    const taskIds = after.map((a) => a.taskId);
    expect(new Set(taskIds).size).toBe(taskIds.length);
    expect(after.length).toBe(assigned.length + second.started);
  });

  it("only opens the Studio when the project is built elsewhere", async () => {
    const slug = await project(owner, "Booking site for a barbershop");
    await db.update(projects).set({ buildStrategy: "external" }).where(eq(projects.slug, slug));
    expect(await startBuilding(owner, slug)).toEqual({ mode: "manual", started: 0, skipped: 0 });
  });

  it("a viewer cannot start it; a stranger gets NOT_FOUND", async () => {
    const slug = await project(owner, "Recipe sharing site");
    await addViewer(slug);
    await expectCode(startBuilding(viewer, slug), "AUTHORIZATION_ERROR");
    await expectCode(startBuilding(stranger, slug), "NOT_FOUND");
  });
});
