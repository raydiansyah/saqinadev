import { describe, expect, it } from "vitest";
import { isEmptyRepo, scaffoldFiles } from "@/lib/executions/scaffold";
import { checkWrites } from "@/lib/executions/write-rules";

describe("isEmptyRepo", () => {
  const f = (path: string, type: "file" | "dir" = "file") => ({ path, type });
  it("is empty with nothing, or only a readme, licence or ignore file", () => {
    expect(isEmptyRepo([])).toBe(true);
    expect(isEmptyRepo([f("README.md"), f("LICENSE"), f(".gitignore")])).toBe(true);
  });
  it("is not empty once there is code, configuration or a folder", () => {
    expect(isEmptyRepo([f("package.json")])).toBe(false);
    expect(isEmptyRepo([f("README.md"), f("src", "dir")])).toBe(false);
    expect(isEmptyRepo([f("main.py")])).toBe(false);
  });
});

describe("the starting app", () => {
  const files = scaffoldFiles("Peta Cari Tempat");
  const by = (path: string) => files.find((x) => x.path === path)?.content ?? "";

  it("has what Next.js needs to build: scripts, pinned framework, layout and page", () => {
    const pkg = JSON.parse(by("package.json"));
    expect(pkg.name).toBe("peta-cari-tempat");
    expect(pkg.scripts).toMatchObject({
      dev: "next dev",
      build: "next build",
      start: "next start",
    });
    expect(pkg.dependencies.next).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies.react).toBe(pkg.dependencies["react-dom"]);
    expect(by("src/app/layout.tsx")).toContain("<html");
    expect(by("src/app/page.tsx")).toContain("export default function");
    expect(JSON.parse(by("tsconfig.json")).compilerOptions.jsx).toBe("react-jsx");
  });

  it("passes the platform's own write rules, so it never needs an exception", () => {
    expect(
      checkWrites(
        files,
        files.map((x) => x.path),
      ).ok,
    ).toBe(true);
  });

  it("holds no secret and no value in the env template", () => {
    expect(by(".env.example")).not.toMatch(/=\S/);
  });

  it("keeps a hostile project name out of the code", () => {
    const hostile = scaffoldFiles("</h1><script>alert(1)</script>{`${x}`}");
    const page = hostile.find((x) => x.path === "src/app/page.tsx")?.content ?? "";
    expect(page).not.toContain("<script>");
    expect(page).not.toContain("{`");
  });
});
