import { describe, expect, it } from "vitest";
import { agentCan, inferRequiredCapabilities, ROLE_TEMPLATES } from "@/lib/agents/capabilities";
import { MockAgentExecutor, UnavailableExecutor } from "@/lib/agents/executor";
import { rankAgents, type SelectableAgent } from "@/lib/agents/selector";
import { availableControls, canTransition } from "@/lib/agents/state";

const team: SelectableAgent[] = ROLE_TEMPLATES.map((t, i) => ({
  id: `a${i}`,
  name: t.role,
  type: "saqina",
  role: t.role,
  status: "available",
  capabilities: t.capabilities,
  priority: t.priority,
}));
const claude: SelectableAgent = {
  id: "c",
  name: "Claude",
  type: "claude",
  role: "general",
  status: "available",
  capabilities: ["frontend", "backend", "testing", "planning"],
  priority: 0,
};

describe("agent selection", () => {
  it("picks by capability, with reasons", () => {
    const [best] = rankAgents({
      required: inferRequiredCapabilities({ title: "Build the login page UI" }),
      agents: team,
    });
    expect(best.agent.role).toBe("frontend");
    expect(best.reasons[0]).toMatchObject({ code: "covers", capabilities: ["frontend"] });
  });

  it("prefers an agent that can run here over a better-matching unconnected one", () => {
    const [best] = rankAgents({ required: ["backend", "planning"], agents: [...team, claude] });
    expect(best.agent.type).toBe("saqina");
  });

  it("never selects disabled or unrelated agents", () => {
    const ranked = rankAgents({
      required: ["git"],
      agents: team.map((a) => ({ ...a, status: a.role === "planner" ? "disabled" : a.status })),
    });
    expect(ranked).toEqual([]);
  });

  it("is deterministic", () => {
    const input = {
      required: inferRequiredCapabilities({ title: "Write regression tests" }),
      agents: team,
    };
    expect(rankAgents(input)).toEqual(rankAgents(input));
  });
});

describe("capability vs permission", () => {
  it("never grants push, deploy or delete, even if stored", () => {
    const agent = { permissions: ["git_push", "deploy", "delete_project", "write_tasks"] as const };
    expect(agentCan({ permissions: [...agent.permissions] }, "git_push")).toBe(false);
    expect(agentCan({ permissions: [...agent.permissions] }, "deploy")).toBe(false);
    expect(agentCan({ permissions: [...agent.permissions] }, "write_tasks")).toBe(true);
  });
});

describe("run state machine", () => {
  it("allows only defined transitions", () => {
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("completed", "running")).toBe(false);
    expect(canTransition("cancelled", "queued")).toBe(false);
    expect(canTransition("failed", "queued")).toBe(true);
  });

  it("offers controls that match the state", () => {
    expect(availableControls("failed")).toMatchObject({ retry: true, cancel: true, pause: false });
    expect(availableControls("completed")).toMatchObject({ retry: false, cancel: false });
  });
});

describe("executors", () => {
  const input = {
    locale: "en" as const,
    project: { name: "POS", slug: "pos" },
    agent: {
      name: "QA",
      type: "saqina" as const,
      role: "qa" as const,
      capabilities: ["testing" as const],
      permissions: ["read_project" as const, "write_tasks" as const, "write_memory" as const],
    },
    task: { id: "t", title: "Checkout", description: "", priority: "high" },
    instructions: "",
    context: { prdExcerpt: null, requirements: [] },
    constraints: [],
    expectedOutput: "",
  };

  it("mock is simulated, deterministic and respects permissions", async () => {
    const a = await new MockAgentExecutor().execute(input);
    const b = await new MockAgentExecutor().execute(input);
    expect(a).toEqual(b);
    expect(a.simulated).toBe(true);
    expect(a.needsApproval).toBe(true);
    const readOnly = await new MockAgentExecutor().execute({
      ...input,
      agent: { ...input.agent, permissions: ["read_project"] },
    });
    expect(readOnly.changes).toEqual([]);
  });

  it("unconnected agents fail honestly", async () => {
    const result = await new UnavailableExecutor().execute(input);
    expect(result).toMatchObject({
      status: "failed",
      error: "execution_unavailable",
      simulated: false,
      changes: [],
    });
  });
});
