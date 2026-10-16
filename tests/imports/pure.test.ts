import { describe, expect, it } from "vitest";
import { AI_SCHEMA, analyzeRules, mergeAnalysis } from "@/lib/imports/analyze";
import {
  MAX_DOCS,
  parseRepoInput,
  pickDocPaths,
  type RepoSnapshot,
} from "@/lib/imports/repo-reader";
import { docSlug } from "@/lib/imports/service";

const file = (path: string, size = 100) => ({ path, type: "file" as const, size });

describe("parseRepoInput", () => {
  it("accepts owner/name and github URLs", () => {
    for (const v of [
      "acme/shop",
      " acme/shop ",
      "https://github.com/acme/shop",
      "https://github.com/acme/shop/",
      "https://github.com/acme/shop.git",
      "https://www.github.com/acme/shop/tree/main/docs",
    ])
      expect(parseRepoInput(v), v).toBe("acme/shop");
  });
  it("rejects everything else, including other hosts", () => {
    for (const v of [
      "",
      "shop",
      "acme",
      "https://gitlab.com/acme/shop",
      "a b/c",
      "../etc/passwd",
      "acme/shop/extra",
    ])
      expect(parseRepoInput(v), v).toBeNull();
  });
});

describe("pickDocPaths", () => {
  it("puts specification files before the README and skips noise", () => {
    const paths = pickDocPaths(
      [
        file("README.md"),
        file("PRD.md"),
        file("CHANGELOG.md"),
        file("LICENSE.txt"),
        file("package.json"),
        file("src", 0),
      ],
      [file("docs/api.md"), file("docs/overview.md"), file("docs/diagram.png")],
    );
    expect(paths.slice(0, 2)).toEqual(["PRD.md", "README.md"]);
    expect(paths).toContain("docs/overview.md");
    expect(paths).not.toContain("CHANGELOG.md");
    expect(paths).not.toContain("LICENSE.txt");
    expect(paths).not.toContain("docs/diagram.png");
    expect(paths).not.toContain("package.json");
  });
  it("reads an extensionless README, common in older repositories", () => {
    expect(pickDocPaths([file("README"), file("LICENSE"), file("Makefile")], [])).toEqual([
      "README",
    ]);
  });
  it("caps the number of files and skips huge ones", () => {
    const many = Array.from({ length: MAX_DOCS + 10 }, (_, i) => file(`docs/note-${i}.md`));
    expect(pickDocPaths([file("README.md")], many)).toHaveLength(MAX_DOCS);
    expect(pickDocPaths([file("README.md", 5_000_000)], [])).toEqual([]);
  });
});

const snapshot = (over: Partial<RepoSnapshot> = {}): RepoSnapshot => ({
  info: { fullName: "acme/restaurant-pos", externalId: "1", defaultBranch: "main", headSha: "abc" },
  docs: [
    {
      path: "README.md",
      content:
        "# Restaurant POS\n\n[![build](https://x/y.svg)](https://x)\n\nA point of sale for small restaurants with table orders, inventory and daily sales reports.\n\n## Install\n",
      truncated: false,
    },
  ],
  stack: { frontend: "Next.js", backend: "Next.js", database: "PostgreSQL", auth: "Better Auth" },
  ...over,
});

describe("analyzeRules", () => {
  it("names the project from the README heading and describes it from the first paragraph", () => {
    const a = analyzeRules(snapshot());
    expect(a.name).toBe("Restaurant POS");
    expect(a.description).toMatch(/^A point of sale for small restaurants/);
    expect(a.description).not.toContain("build");
  });
  it("marks the project as existing with its own detected stack", () => {
    const { answers } = analyzeRules(snapshot());
    expect(answers.projectState).toBe("existing");
    expect(answers.techPreference).toBe("own");
    expect(answers.ownStack).toMatchObject({
      frontend: "Next.js",
      database: "PostgreSQL",
      auth: "Better Auth",
    });
    expect(answers.databaseNeed).toBe("yes");
    expect(answers.databaseChoice).toBe("postgresql");
    expect(answers.versioning).toBe("yes");
    expect(answers.projectType).toBe("pos");
  });
  it("ignores generic headings such as PRD when naming the project", () => {
    const docs = [
      {
        path: "PRD.md",
        content:
          "# Product Requirements\n\nThe shop sells goods online to buyers across the country.\n",
        truncated: false,
      },
    ];
    expect(analyzeRules(snapshot({ docs })).name).toBe("Restaurant Pos");
  });
  it("falls back to the repository name when there are no documents", () => {
    const a = analyzeRules(snapshot({ docs: [], stack: {} }));
    expect(a.name).toBe("Restaurant Pos");
    expect(a.description.length).toBeGreaterThanOrEqual(10);
    expect(a.answers.databaseNeed).toBeUndefined();
  });
  it("maps databases it cannot name to other", () => {
    expect(analyzeRules(snapshot({ stack: { database: "MongoDB" } })).answers.databaseChoice).toBe(
      "other",
    );
    expect(
      analyzeRules(snapshot({ stack: { database: "Supabase (PostgreSQL)" } })).answers
        .databaseChoice,
    ).toBe("supabase");
  });
});

describe("AI merge", () => {
  const ai = {
    name: "Kasir Resto",
    description: "Aplikasi kasir untuk restoran kecil.",
    projectType: "pos" as const,
    audience: ["employees" as const],
    features: ["pos" as const, "reports" as const],
    platforms: ["web" as const],
    authMethods: ["email" as const],
  };
  it("lets model values win and keeps the detected stack", () => {
    const merged = mergeAnalysis(analyzeRules(snapshot()), ai);
    expect(merged.name).toBe("Kasir Resto");
    expect(merged.answers.features).toEqual(["pos", "reports"]);
    expect(merged.answers.ownStack?.database).toBe("PostgreSQL");
    expect(merged.details?.platforms).toEqual(["web"]);
  });
  it("falls back to rules for fields the model left empty", () => {
    const rules = analyzeRules(snapshot());
    const merged = mergeAnalysis(rules, { ...ai, features: [], audience: [], projectType: null });
    expect(merged.answers.features).toEqual(rules.answers.features);
    expect(merged.answers.projectType).toBe("pos");
  });
  it("rejects model output outside the allowed values", () => {
    expect(AI_SCHEMA.safeParse({ ...ai, projectType: "hack-the-planet" }).success).toBe(false);
    expect(AI_SCHEMA.safeParse({ ...ai, features: ["drop-table"] }).success).toBe(false);
    expect(AI_SCHEMA.safeParse({ ...ai, name: "x".repeat(500) }).success).toBe(false);
    expect(AI_SCHEMA.safeParse(ai).success).toBe(true);
  });
});

describe("docSlug", () => {
  it("builds unique, prefixed slugs", () => {
    const taken = new Set<string>();
    expect(docSlug("README.md", taken)).toBe("repo-readme");
    expect(docSlug("docs/api/overview.md", taken)).toBe("repo-docs-api-overview");
    expect(docSlug("readme.md", taken)).toBe("repo-readme-2");
    expect(docSlug("a".repeat(200) + ".md", taken).length).toBeLessThanOrEqual(64);
  });
  it("never collides with the generated PRD and PLAN slugs", () => {
    const taken = new Set<string>();
    expect(docSlug("PRD.md", taken)).toBe("repo-prd");
    expect(docSlug("PLAN.md", taken)).toBe("repo-plan");
  });
});
