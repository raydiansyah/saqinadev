import { describe, expect, it } from "vitest";
import { mapDocs } from "@/lib/imports/map-docs";
import { parseTasks } from "@/lib/imports/tasks";

const doc = (path: string, content = "x") => ({ path, content, truncated: false });

describe("mapDocs", () => {
  it("finds the PRD, plan and task list by file name", () => {
    const m = mapDocs([
      doc("README.md"),
      doc("PRD.md"),
      doc("docs/PLAN.md"),
      doc("docs/TASKS.md"),
      doc("docs/architecture.md"),
    ]);
    expect([m.prd?.path, m.plan?.path, m.tasks?.path]).toEqual([
      "PRD.md",
      "docs/PLAN.md",
      "docs/TASKS.md",
    ]);
  });

  it("never takes a README for any of them, however it is written", () => {
    expect(mapDocs([doc("README.md", "# Plan\n- [ ] a task")])).toEqual({
      prd: null,
      plan: null,
      tasks: null,
    });
  });

  it("prefers the file nearest the root", () => {
    expect(mapDocs([doc("docs/prd.md"), doc("PRD.md"), doc("docs/old/prd.md")]).prd?.path).toBe(
      "PRD.md",
    );
    expect(mapDocs([doc("docs/old/prd.md"), doc("docs/prd.md")]).prd?.path).toBe("docs/prd.md");
  });

  it("recognises common names, in any case", () => {
    expect(mapDocs([doc("Product-Requirements.md")]).prd).not.toBeNull();
    expect(mapDocs([doc("docs/Roadmap.md")]).plan).not.toBeNull();
    expect(mapDocs([doc("implementation-plan.md")]).plan).not.toBeNull();
    expect(mapDocs([doc("TODO.md")]).tasks).not.toBeNull();
    expect(mapDocs([doc("backlog.md")]).tasks).not.toBeNull();
  });

  it("does not use one file for two roles", () => {
    const m = mapDocs([doc("spec.md")]);
    expect(m.prd?.path).toBe("spec.md");
    expect(m.plan).toBeNull();
  });
});

describe("parseTasks", () => {
  const md = `# Tasks

## Phase 1: Ordering
- [x] Set up the project
- [ ] Pickup slot picker
  - uses the calendar widget
- [ ] Order email

## Phase 2: Kitchen
- [ ] Daily production list
`;

  it("groups checkbox items under the heading above them and keeps their state", () => {
    const out = parseTasks(md, { plainItems: false });
    expect(out.map((m) => m.title)).toEqual(["Phase 1: Ordering", "Phase 2: Kitchen"]);
    expect(out[0].tasks.map((t) => [t.title, t.done])).toEqual([
      ["Set up the project", true],
      ["Pickup slot picker", false],
      ["Order email", false],
    ]);
    expect(out[0].tasks[1].description).toContain("calendar widget");
  });

  it("ignores plain bullets in a plan, but takes them in a task list", () => {
    const text = "## Phase 1\n- Build the ordering flow\n- [ ] Write tests\n";
    expect(parseTasks(text, { plainItems: false })[0].tasks.map((t) => t.title)).toEqual([
      "Write tests",
    ]);
    expect(parseTasks(text, { plainItems: true })[0].tasks.map((t) => t.title)).toEqual([
      "Build the ordering flow",
      "Write tests",
    ]);
  });

  it("uses a default milestone when items sit under a generic heading, and skips code and licence lists", () => {
    const out = parseTasks(
      "# TODO\n- [ ] First thing\n\n```\n- [ ] not a task\n```\n\n## License\n- [ ] MIT\n",
      {
        plainItems: false,
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Imported tasks");
    expect(out[0].tasks.map((t) => t.title)).toEqual(["First thing"]);
  });

  it("caps the number of tasks", () => {
    const many = Array.from({ length: 500 }, (_, i) => `- [ ] Task number ${i}`).join("\n");
    const total = parseTasks(`## Big\n${many}`, { plainItems: false }).flatMap(
      (m) => m.tasks,
    ).length;
    expect(total).toBe(200);
  });
});
