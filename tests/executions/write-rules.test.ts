import { describe, expect, it } from "vitest";
import { checkWrites, inScope, normalizePath } from "@/lib/executions/write-rules";

const file = (path: string, content = "export const x = 1;\n") => ({ path, content });

describe("normalizePath", () => {
  it("accepts a plain repository path and trims the edges", () => {
    expect(normalizePath("./src/a.ts")).toBe("src/a.ts");
    expect(normalizePath("/src/a/")).toBe("src/a");
  });

  it("refuses traversal, backslashes, empty parts and NUL", () => {
    for (const bad of ["../x", "src/../../x", "a\\b", "a//b", "a\u0000b", "", "/"])
      expect(normalizePath(bad), bad).toBeNull();
  });
});

describe("inScope", () => {
  it("matches the target itself and what is under it, not a name that shares the start", () => {
    expect(inScope("src/api/checkout.ts", ["src/api/checkout.ts"])).toBe(true);
    expect(inScope("src/app/checkout/page.tsx", ["src/app/checkout"])).toBe(true);
    expect(inScope("src/app/checkout-old/page.tsx", ["src/app/checkout"])).toBe(false);
    expect(inScope("src/x.ts", [])).toBe(false);
  });
});

describe("checkWrites", () => {
  const targets = ["src/api", "tests/checkout.test.ts"];

  it("accepts files inside the task's scope", () => {
    const result = checkWrites(
      [file("src/api/checkout.ts"), file("tests/checkout.test.ts")],
      targets,
    );
    expect(result.ok).toBe(true);
  });

  it("refuses the whole change when one file is outside the scope", () => {
    const result = checkWrites([file("src/api/checkout.ts"), file("src/app/other.ts")], targets);
    expect(result).toEqual({
      ok: false,
      problems: [{ code: "out_of_scope", path: "src/app/other.ts" }],
    });
  });

  it("gives a task with no target paths no right to write", () => {
    expect(checkWrites([file("src/a.ts")], [])).toEqual({
      ok: false,
      problems: [{ code: "no_write_scope" }],
    });
  });

  it("never lets an agent write secrets files, git internals or dependencies", () => {
    for (const path of [
      ".env",
      ".env.local",
      ".git/config",
      "node_modules/x/index.js",
      "keys/server.pem",
      "id_rsa",
    ]) {
      const result = checkWrites([file(path)], ["."].concat(path.split("/")[0]));
      expect(result.ok, path).toBe(false);
    }
  });

  it("refuses content that holds a secret", () => {
    const result = checkWrites(
      [file("src/api/a.ts", `const k = "ghp_${"a".repeat(36)}";`)],
      targets,
    );
    expect(result).toMatchObject({
      ok: false,
      problems: [{ code: "secret_in_content", path: "src/api/a.ts" }],
    });
  });

  it("limits how much one task may write, and refuses the same path twice", () => {
    const many = Array.from({ length: 13 }, (_, i) => file(`src/api/f${i}.ts`));
    expect(checkWrites(many, targets)).toMatchObject({
      ok: false,
      problems: [{ code: "too_many_files" }],
    });
    expect(checkWrites([file("src/api/a.ts", "x".repeat(100_001))], targets)).toMatchObject({
      ok: false,
    });
    expect(checkWrites([file("src/api/a.ts"), file("./src/api/a.ts")], targets)).toMatchObject({
      ok: false,
      problems: [{ code: "duplicate_path" }],
    });
  });
});
