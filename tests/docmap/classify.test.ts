import { describe, expect, it } from "vitest";
import { classifyDoc } from "@/lib/docmap/classify";

const c = (path: string, content = "") => classifyDoc({ path, content });

describe("classifyDoc", () => {
  it("treats anything under a memory folder as memory, whatever the file is called", () => {
    expect(c("docs/memory/auth-notes.md")).toMatchObject({ role: "memory", by: "folder" });
    expect(c("documentation/memory/PRD.md").role).toBe("memory");
  });

  it("finds PRD, plan and tasks by name wherever the docs folder is", () => {
    expect(c("PRD.md").role).toBe("prd");
    expect(c("doc/sdlc/PLAN.md").role).toBe("plan");
    expect(c("documentation/product/tasks.md").role).toBe("tasks");
  });

  it("uses the folder when the name says nothing", () => {
    expect(c("docs/sdlc/release.md").role).toBe("process");
    expect(c("docs/adr/0003-use-postgres.md").role).toBe("decision");
    expect(c("docs/clients/acme-call.md").role).toBe("client");
    expect(c("docs/design/overview.md").role).toBe("spec");
  });

  it("reads the text for files in unknown places", () => {
    const prd = "# Product Requirements\n\n## Goals\nx\n\n## Features\ny\n\n## Scope\nz\n";
    expect(c("notes/what-we-build.md", prd)).toMatchObject({ role: "prd", by: "content" });
    expect(c("notes/x.md", "# Architecture Decision: cache\n\nWe chose Redis.").role).toBe(
      "decision",
    );
  });

  it("leaves housekeeping files and unknown prose as other", () => {
    expect(c("CHANGELOG.md").role).toBe("other");
    expect(c("docs/random.md", "# Hello\n\nJust words.")).toMatchObject({
      role: "other",
      confidence: 30,
    });
  });

  it("is deterministic", () => {
    expect(c("docs/sdlc/a.md", "# A")).toEqual(c("docs/sdlc/a.md", "# A"));
  });
});
