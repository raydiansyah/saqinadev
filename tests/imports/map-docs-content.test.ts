import { describe, expect, it } from "vitest";
import { mapDocs } from "@/lib/imports/map-docs";
import { groundRoles } from "@/lib/imports/roles-ai";

const doc = (path: string, content = "") => ({ path, content, truncated: false });

const PRD_TEXT = `# Product Requirements

## Goals
- Sell more

## Features
- Reservations
`;
const TASK_TEXT = "# Sprint notes\n\n- [ ] one\n- [x] two\n- [ ] three\n- [ ] four\n- [ ] five\n";
const PLAN_TEXT =
  "# Roadmap for the first release\n\n## Phase 1\nOrdering.\n\n## Phase 2\nKitchen.\n";

describe("mapDocs by what the text says", () => {
  it("recognises documents whatever they are called", () => {
    const m = mapDocs([
      doc("docs/produk/kebutuhan.md", PRD_TEXT),
      doc("docs/strategy/v1.md", PLAN_TEXT),
      doc("docs/work/next.md", TASK_TEXT),
    ]);
    expect([m.prd?.path, m.plan?.path, m.tasks?.path]).toEqual([
      "docs/produk/kebutuhan.md",
      "docs/strategy/v1.md",
      "docs/work/next.md",
    ]);
  });

  it("lets a file name win over the text", () => {
    const m = mapDocs([doc("docs/anything.md", PRD_TEXT), doc("PRD.md", "short")]);
    expect(m.prd?.path).toBe("PRD.md");
  });

  it("does not take a README or prose that only mentions the words", () => {
    expect(
      mapDocs([doc("README.md", PRD_TEXT), doc("docs/notes.md", "We should plan the tasks soon.")]),
    ).toEqual({
      prd: null,
      plan: null,
      tasks: null,
    });
  });

  it("needs real structure: a title alone, or one lone checkbox, is not enough", () => {
    expect(
      mapDocs([doc("docs/a.md", "# Product Requirements\n\nTo be written.\n")]).prd,
    ).toBeNull();
    expect(mapDocs([doc("docs/b.md", "# Notes\n\n- [ ] only one\n")]).tasks).toBeNull();
  });
});

describe("mapDocs with a model's hints", () => {
  const docs = [doc("docs/x/one.md", "a"), doc("docs/x/two.md", "b"), doc("PRD.md", "c")];

  it("uses a hinted path for a role the names did not fill", () => {
    expect(mapDocs(docs, { plan: "docs/x/one.md" }).plan?.path).toBe("docs/x/one.md");
  });

  it("ignores a path that is not a document, and never overrides a name match", () => {
    expect(mapDocs(docs, { plan: "docs/missing.md" }).plan).toBeNull();
    expect(mapDocs(docs, { prd: "docs/x/two.md" }).prd?.path).toBe("PRD.md");
  });

  it("gives one document one role", () => {
    const m = mapDocs(docs, { plan: "docs/x/one.md", tasks: "docs/x/one.md" });
    expect(m.plan?.path).toBe("docs/x/one.md");
    expect(m.tasks).toBeNull();
  });
});

describe("groundRoles", () => {
  const docs = [{ path: "a.md" }, { path: "b.md" }, { path: "c.md" }];

  it("keeps real, confident picks, one per role, best first", () => {
    expect(
      groundRoles(
        [
          { path: "a.md", role: "prd", confidence: 70 },
          { path: "b.md", role: "prd", confidence: 95 },
          { path: "c.md", role: "plan", confidence: 80 },
        ],
        docs,
      ),
    ).toEqual({ prd: "b.md", plan: "c.md" });
  });

  it("drops invented paths, weak answers, 'other' and a path used twice", () => {
    expect(
      groundRoles(
        [
          { path: "nope.md", role: "prd", confidence: 99 },
          { path: "a.md", role: "plan", confidence: 40 },
          { path: "b.md", role: "other", confidence: 99 },
          { path: "c.md", role: "tasks", confidence: 90 },
          { path: "c.md", role: "plan", confidence: 85 },
        ],
        docs,
      ),
    ).toEqual({ tasks: "c.md" });
  });
});
