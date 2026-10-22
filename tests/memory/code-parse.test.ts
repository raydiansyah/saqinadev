import { describe, expect, it } from "vitest";
import { isSourcePath, parseSource } from "@/lib/memory/code/parse";
import { isTestPath, linkGraph, resolveSpecifier } from "@/lib/memory/code/resolve";

const SRC = `
import { helper, other as renamed } from "./util";
import Default from "../lib/default";
import * as ns from "./ns";
import "./side-effect";
export { helper as exposed } from "./util";

export interface Options { a: number }
export type Id = string;
export enum Mode { A, B }

export function run(x: number) {
  helper(x);
  ns.build();
  return Default();
}

const hidden = () => { renamed(); };
export const arrow = () => hidden();
export const VALUE = 3;
const plain = 4;

export default class Service {
  constructor() { this.setup(); }
  setup() { run(1); }
  static make() { return new Service(); }
  handler = () => { helper(2); };
}

async function load() { return import("./lazy"); }
const legacy = require("./legacy");
`;

describe("reading a source file", () => {
  it("finds declarations, with kind, export state and place", async () => {
    const p = await parseSource("src/a.ts", SRC);
    const by = (n: string) => p.symbols.find((s) => s.name === n);
    expect(by("run")).toMatchObject({ kind: "function", exported: true, startLine: 12 });
    expect(by("hidden")).toMatchObject({ kind: "function", exported: false });
    expect(by("arrow")).toMatchObject({ kind: "function", exported: true });
    expect(by("VALUE")).toMatchObject({ kind: "variable", exported: true });
    expect(by("plain")).toBeUndefined();
    expect(by("Options")).toMatchObject({ kind: "interface", exported: true });
    expect(by("Id")).toMatchObject({ kind: "type" });
    expect(by("Mode")).toMatchObject({ kind: "enum" });
    expect(by("Service")).toMatchObject({ kind: "class", exported: true, isDefault: true });
    expect(by("load")).toMatchObject({ kind: "function", exported: false });
  });

  it("puts methods under their class", async () => {
    const p = await parseSource("src/a.ts", SRC);
    const cls = p.symbols.findIndex((s) => s.name === "Service");
    const methods = p.symbols.filter((s) => s.kind === "method");
    expect(methods.map((m) => m.name).sort()).toEqual(["constructor", "handler", "make", "setup"]);
    expect(methods.every((m) => m.parent === cls)).toBe(true);
  });

  it("records every kind of import, with what each binds", async () => {
    const p = await parseSource("src/a.ts", SRC);
    const get = (spec: string, kind: string) =>
      p.imports.find((i) => i.specifier === spec && i.kind === kind);
    expect(get("./util", "named")?.bindings).toEqual([
      { imported: "helper", local: "helper" },
      { imported: "other", local: "renamed" },
    ]);
    expect(get("../lib/default", "default")?.bindings).toEqual([
      { imported: "default", local: "Default" },
    ]);
    expect(get("./ns", "namespace")?.bindings).toEqual([{ imported: "*", local: "ns" }]);
    expect(get("./side-effect", "side_effect")).toBeDefined();
    expect(get("./util", "reexport")?.bindings).toEqual([{ imported: "helper", local: "exposed" }]);
    expect(get("./lazy", "side_effect")).toBeDefined();
    expect(get("./legacy", "side_effect")).toBeDefined();
  });

  it("attributes calls to the function or method they are in", async () => {
    const p = await parseSource("src/a.ts", SRC);
    const callsIn = (name: string) =>
      p.calls
        .filter((c) => c.caller !== null && p.symbols[c.caller].name === name)
        .map((c) => `${c.qualifier ?? ""}.${c.name}`);
    expect(callsIn("run").sort()).toEqual([".Default", ".helper", "ns.build"]);
    expect(callsIn("hidden")).toEqual([".renamed"]);
    expect(callsIn("arrow")).toEqual([".hidden"]);
    expect(callsIn("constructor")).toEqual(["this.setup"]);
    expect(callsIn("make")).toEqual([".Service"]);
    expect(callsIn("handler")).toEqual([".helper"]);
    // require() and import() are imports, not calls.
    expect(p.calls.map((c) => c.name)).not.toContain("require");
  });

  it("copes with JSX, plain JavaScript and broken code", async () => {
    const jsx = await parseSource(
      "src/ui.tsx",
      "export function View() { return <div onClick={() => go()} />; }\nfunction go() {}\n",
    );
    expect(jsx.symbols.map((s) => s.name)).toEqual(["View", "go"]);
    expect(jsx.calls.map((c) => c.name)).toEqual(["go"]);
    const js = await parseSource(
      "lib/x.js",
      "module.exports = function () {};\nfunction a() { b(); }\n",
    );
    expect(js.symbols.map((s) => s.name)).toEqual(["a"]);
    const broken = await parseSource(
      "src/b.ts",
      "export function ok() {}\nexport function ( {{{ \n",
    );
    expect(broken.symbols.map((s) => s.name)).toContain("ok");
  });

  it("knows what a source file is", () => {
    expect(isSourcePath("src/a.ts")).toBe(true);
    expect(isSourcePath("src/a.d.ts")).toBe(false);
    expect(isSourcePath("README.md")).toBe(false);
  });
});

describe("linking files", () => {
  const paths = new Set([
    "src/a.ts",
    "src/util.ts",
    "src/lib/index.ts",
    "src/lib/default.tsx",
    "src/ns.js",
  ]);

  it("resolves relative paths, index files, ESM-style .js names and aliases", () => {
    expect(resolveSpecifier("src/a.ts", "./util", {}, paths)).toBe("src/util.ts");
    expect(resolveSpecifier("src/a.ts", "./lib", {}, paths)).toBe("src/lib/index.ts");
    expect(resolveSpecifier("src/lib/x.ts", "../util.js", {}, paths)).toBe("src/util.ts");
    expect(resolveSpecifier("app/p.ts", "@/lib/default", { "@/": "src/" }, paths)).toBe(
      "src/lib/default.tsx",
    );
    expect(resolveSpecifier("src/a.ts", "react", {}, paths)).toBeNull();
    expect(resolveSpecifier("src/a.ts", "./missing", {}, paths)).toBeNull();
  });

  it("links a call only when the syntax and the imports agree", () => {
    const files = [
      { id: "fa", path: "src/a.ts" },
      { id: "fu", path: "src/util.ts" },
    ];
    const symbols = [
      {
        id: "run",
        fileId: "fa",
        name: "run",
        kind: "function" as const,
        exported: true,
        isDefault: false,
        parentId: null,
      },
      {
        id: "helper",
        fileId: "fu",
        name: "helper",
        kind: "function" as const,
        exported: true,
        isDefault: false,
        parentId: null,
      },
      {
        id: "Svc",
        fileId: "fu",
        name: "Svc",
        kind: "class" as const,
        exported: true,
        isDefault: false,
        parentId: null,
      },
      {
        id: "make",
        fileId: "fu",
        name: "make",
        kind: "method" as const,
        exported: false,
        isDefault: false,
        parentId: "Svc",
      },
    ];
    const imports = [
      {
        id: "i1",
        fileId: "fa",
        specifier: "./util",
        kind: "named" as const,
        bindings: [
          { imported: "helper", local: "h" },
          { imported: "Svc", local: "Svc" },
        ],
      },
      {
        id: "i2",
        fileId: "fa",
        specifier: "react",
        kind: "named" as const,
        bindings: [{ imported: "memo", local: "memo" }],
      },
    ];
    const calls = [
      { id: "c1", fileId: "fa", callerSymbolId: "run", name: "h", qualifier: null },
      { id: "c2", fileId: "fa", callerSymbolId: "run", name: "memo", qualifier: null },
      { id: "c3", fileId: "fa", callerSymbolId: "run", name: "make", qualifier: "Svc" },
      { id: "c4", fileId: "fa", callerSymbolId: "run", name: "run", qualifier: null },
      { id: "c5", fileId: "fa", callerSymbolId: "run", name: "whatever", qualifier: "obj" },
    ];
    const { importTargets, callTargets } = linkGraph(files, symbols, imports, calls, {});
    expect(importTargets.get("i1")).toBe("fu");
    expect(importTargets.get("i2")).toBeNull();
    expect(callTargets.get("c1")).toBe("helper");
    expect(callTargets.get("c2")).toBeUndefined();
    expect(callTargets.get("c3")).toBe("make");
    expect(callTargets.get("c4")).toBe("run");
    expect(callTargets.has("c5")).toBe(false);
  });

  it("follows a re-export to the symbol and recognises tests", () => {
    const files = [
      { id: "fa", path: "src/a.ts" },
      { id: "fi", path: "src/lib/index.ts" },
      { id: "fu", path: "src/lib/util.ts" },
    ];
    const symbols = [
      {
        id: "tool",
        fileId: "fu",
        name: "tool",
        kind: "function" as const,
        exported: true,
        isDefault: false,
        parentId: null,
      },
    ];
    const imports = [
      {
        id: "i1",
        fileId: "fa",
        specifier: "./lib",
        kind: "named" as const,
        bindings: [{ imported: "tool", local: "tool" }],
      },
      {
        id: "i2",
        fileId: "fi",
        specifier: "./util",
        kind: "reexport" as const,
        bindings: [{ imported: "*", local: "*" }],
      },
    ];
    const calls = [{ id: "c1", fileId: "fa", callerSymbolId: null, name: "tool", qualifier: null }];
    expect(linkGraph(files, symbols, imports, calls, {}).callTargets.get("c1")).toBe("tool");
    expect(isTestPath("tests/a.test.ts")).toBe(true);
    expect(isTestPath("src/a.spec.tsx")).toBe(true);
    expect(isTestPath("src/lib/a.ts")).toBe(false);
  });
});

describe("hostile files", () => {
  it("caps imports, cuts long names and removes NUL, so every row can be stored", async () => {
    const many = await parseSource("src/m.ts", `${'import"a";'.repeat(5000)}\n`);
    expect(many.imports.length).toBeLessThanOrEqual(1000);
    const long = await parseSource(
      "src/l.ts",
      `export function ${"x".repeat(5000)}() {}\nimport "a\u0000b";\n`,
    );
    expect(long.symbols[0].name.length).toBeLessThanOrEqual(200);
    expect(long.imports[0].specifier).toBe("ab");
    expect(JSON.stringify(long)).not.toContain("\u0000");
  });

  it("fails a very deeply nested file with an error the indexer can catch, not a crash", async () => {
    const deep = `${"[".repeat(5000)}${"]".repeat(5000)}`;
    await expect(parseSource("src/d.ts", `const a = ${deep};\n`)).rejects.toBeInstanceOf(
      RangeError,
    );
  });

  it("reads many functions in reasonable time", async () => {
    const text = Array.from({ length: 4000 }, (_, i) => `function f${i}() { g${i}(); }`).join("\n");
    const t = Date.now();
    const page = await parseSource("src/many.ts", text);
    expect(Date.now() - t).toBeLessThan(3000);
    expect(page.symbols.length).toBe(800); // the cap per file
  });
});

describe("linking edge cases", () => {
  const paths = new Set(["src/a.ts", "lib/x.ts"]);
  it("does not let a path climb out of the repository", () => {
    expect(resolveSpecifier("src/a.ts", "../../../lib/x", {}, paths)).toBeNull();
    expect(resolveSpecifier("src/a.ts", "../lib/x", {}, paths)).toBe("lib/x.ts");
  });

  it("treats export * as ns as one name, not every name, and survives a barrel mesh", () => {
    const files = [
      { id: "f1", path: "a.ts" },
      { id: "f2", path: "b.ts" },
      { id: "f3", path: "c.ts" },
    ];
    const sym = {
      id: "s",
      fileId: "f3",
      name: "foo",
      kind: "function" as const,
      exported: true,
      isDefault: false,
      parentId: null,
    };
    const imports = [
      {
        id: "i1",
        fileId: "f1",
        specifier: "./b",
        kind: "named" as const,
        bindings: [{ imported: "foo", local: "foo" }],
      },
      {
        id: "i2",
        fileId: "f2",
        specifier: "./c",
        kind: "reexport" as const,
        bindings: [{ imported: "*", local: "ns" }],
      },
    ];
    const calls = [{ id: "c1", fileId: "f1", callerSymbolId: null, name: "foo", qualifier: null }];
    expect(linkGraph(files, [sym], imports, calls, {}).callTargets.has("c1")).toBe(false);

    // Every file re-exports every other: the lookup ends instead of exploding.
    const n = 40;
    const mesh = Array.from({ length: n }, (_, i) => ({ id: `m${i}`, path: `m${i}.ts` }));
    const meshImports = mesh.flatMap((f, i) =>
      mesh
        .filter((_, j) => j !== i)
        .map((g, j) => ({
          id: `r${i}-${j}`,
          fileId: f.id,
          specifier: `./${g.path.replace(".ts", "")}`,
          kind: "reexport" as const,
          bindings: [{ imported: "*", local: "*" }],
        })),
    );
    const start = Date.now();
    linkGraph(
      mesh,
      [],
      meshImports,
      [{ id: "c", fileId: "m0", callerSymbolId: null, name: "nothing", qualifier: null }],
      {},
    );
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("local names", () => {
  const src = `
import { log, build } from "./util";
export function a(log) { log(); build(); }
export function b() { const build = () => 1; build(); return log(); }
export function c(service) { service.run(); try { x(); } catch (build) { build(); } }
function d() { function log() {} log(); }
`;

  it("does not record a call to a name that a function binds itself", async () => {
    const p = await parseSource("src/a.ts", src);
    const callsIn = (fn: string) =>
      p.calls
        .filter((c) => c.caller !== null && p.symbols[c.caller].name === fn)
        .map((c) => c.name);
    expect(callsIn("a")).toEqual(["build"]); // log is the parameter, build is the import
    expect(callsIn("b")).toEqual(["log"]); // build is local
    expect(callsIn("d")).toEqual([]);
    expect(callsIn("c")).toEqual(["run", "x"]); // build in catch is the catch variable
  });

  it("gives a method called on a local object no qualifier that could resolve to a class", async () => {
    const p = await parseSource("src/a.ts", src);
    const run = p.calls.find((c) => c.name === "run");
    expect(run?.qualifier).toBe("*local");
    const files = [{ id: "f", path: "src/a.ts" }];
    const symbols = [
      {
        id: "svc",
        fileId: "f",
        name: "service",
        kind: "class" as const,
        exported: false,
        isDefault: false,
        parentId: null,
      },
      {
        id: "m",
        fileId: "f",
        name: "run",
        kind: "method" as const,
        exported: false,
        isDefault: false,
        parentId: "svc",
      },
    ];
    const calls = [
      { id: "c", fileId: "f", callerSymbolId: null, name: "run", qualifier: "*local" },
    ];
    expect(linkGraph(files, symbols, [], calls, {}).callTargets.has("c")).toBe(false);
  });
});
