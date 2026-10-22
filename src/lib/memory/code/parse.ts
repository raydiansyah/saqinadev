import type { ImportBinding, ImportKind, SymbolKind } from "@/lib/db/schema";

/**
 * Reads one TypeScript or JavaScript file into symbols, imports and calls, from its syntax tree
 * (TypeScript's own parser, syntax only: nothing is type-checked or run). Pure apart from loading
 * the parser. What is recorded is what the syntax shows; what cannot be known from syntax alone
 * (dynamic calls, aliasing, inheritance) is not guessed here.
 */

export interface ParsedSymbol {
  name: string;
  kind: SymbolKind;
  exported: boolean;
  isDefault: boolean;
  startLine: number;
  endLine: number;
  /** Index (in `symbols`) of the class a method belongs to. */
  parent: number | null;
}
export interface ParsedImport {
  specifier: string;
  kind: ImportKind;
  bindings: ImportBinding[];
  line: number;
}
export interface ParsedCall {
  /** Index (in `symbols`) of the function or method the call is in; null at module level. */
  caller: number | null;
  name: string;
  /** `this`, or the identifier the method is called on (`Foo` in `Foo.bar()`); null otherwise. */
  qualifier: string | null;
  line: number;
}
export interface ParsedFile {
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  calls: ParsedCall[];
  lineCount: number;
}

export const LANGUAGES: Record<string, "typescript" | "javascript"> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
};
export const extensionOf = (path: string) => path.slice(path.lastIndexOf(".")).toLowerCase();
export const isSourcePath = (path: string) =>
  extensionOf(path) in LANGUAGES && !path.endsWith(".d.ts");

const MAX_SYMBOLS = 800;
const MAX_CALLS = 2000;
const MAX_IMPORTS = 1000;
/** Names and specifiers are cut and stripped of NUL (which text columns refuse) before they are kept. */
const clean = (text: string, max = 200) => text.replace(/\0/g, "").slice(0, max);

type Ts = typeof import("typescript");
let loaded: Promise<Ts> | undefined;
/** The parser is large; it is loaded on first use, only by the indexing job. */
const loadTs = (): Promise<Ts> => {
  loaded ??= import("typescript").then((m) => (m as unknown as { default?: Ts }).default ?? m);
  return loaded;
};

export async function parserVersion(): Promise<string> {
  return `typescript@${(await loadTs()).version}`;
}

export async function parseSource(path: string, text: string): Promise<ParsedFile> {
  const ts = await loadTs();
  const ext = extensionOf(path);
  const kind =
    ext === ".tsx"
      ? ts.ScriptKind.TSX
      : ext === ".jsx"
        ? ts.ScriptKind.JSX
        : LANGUAGES[ext] === "javascript"
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const line = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const calls: ParsedCall[] = [];
  const hasModifier = (node: import("typescript").Node, k: import("typescript").SyntaxKind) =>
    ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((m) => m.kind === k));

  const add = (node: import("typescript").Node, s: Omit<ParsedSymbol, "startLine" | "endLine">) => {
    if (symbols.length >= MAX_SYMBOLS) return -1;
    symbols.push({
      ...s,
      name: clean(s.name),
      startLine: line(node.getStart(sf)),
      endLine: line(node.getEnd()),
    });
    return symbols.length - 1;
  };

  // `export { a, b as c }` and `export default a`: names exported by a statement of their own.
  const exportedLater = new Set<string>();
  let defaultName: string | null = null;
  for (const st of sf.statements) {
    if (
      ts.isExportDeclaration(st) &&
      !st.moduleSpecifier &&
      st.exportClause &&
      ts.isNamedExports(st.exportClause)
    ) {
      for (const el of st.exportClause.elements)
        exportedLater.add((el.propertyName ?? el.name).text);
    }
    if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression))
      defaultName = st.expression.text;
  }

  const isFn = (n: import("typescript").Node | undefined) =>
    Boolean(n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n)));

  const declare = (st: import("typescript").Statement) => {
    const exported = hasModifier(st, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(st, ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(st)) {
      const name = st.name?.text ?? (isDefault ? "default" : null);
      if (name)
        add(st, {
          name,
          kind: "function",
          exported: exported || exportedLater.has(name) || defaultName === name,
          isDefault: isDefault || defaultName === name,
          parent: null,
        });
    } else if (ts.isClassDeclaration(st)) {
      const name = st.name?.text ?? (isDefault ? "default" : null);
      if (!name) return;
      const parent = add(st, {
        name,
        kind: "class",
        exported: exported || exportedLater.has(name) || defaultName === name,
        isDefault: isDefault || defaultName === name,
        parent: null,
      });
      for (const m of st.members) {
        const mname = ts.isConstructorDeclaration(m)
          ? "constructor"
          : m.name &&
              (ts.isIdentifier(m.name) ||
                ts.isStringLiteral(m.name) ||
                ts.isPrivateIdentifier(m.name))
            ? m.name.text
            : null;
        const callable =
          ts.isMethodDeclaration(m) ||
          ts.isConstructorDeclaration(m) ||
          ts.isGetAccessor(m) ||
          ts.isSetAccessor(m) ||
          (ts.isPropertyDeclaration(m) && isFn(m.initializer));
        if (mname && callable && parent >= 0)
          add(m, { name: mname, kind: "method", exported: false, isDefault: false, parent });
      }
    } else if (ts.isInterfaceDeclaration(st)) {
      add(st, {
        name: st.name.text,
        kind: "interface",
        exported: exported || exportedLater.has(st.name.text),
        isDefault: false,
        parent: null,
      });
    } else if (ts.isTypeAliasDeclaration(st)) {
      add(st, {
        name: st.name.text,
        kind: "type",
        exported: exported || exportedLater.has(st.name.text),
        isDefault: false,
        parent: null,
      });
    } else if (ts.isEnumDeclaration(st)) {
      add(st, {
        name: st.name.text,
        kind: "enum",
        exported: exported || exportedLater.has(st.name.text),
        isDefault: false,
        parent: null,
      });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const name = d.name.text;
        const out = exported || exportedLater.has(name) || defaultName === name;
        // Plain private constants are noise; functions and exported values are the structure.
        if (isFn(d.initializer))
          add(d, {
            name,
            kind: "function",
            exported: out,
            isDefault: defaultName === name,
            parent: null,
          });
        else if (out)
          add(d, {
            name,
            kind: "variable",
            exported: true,
            isDefault: defaultName === name,
            parent: null,
          });
      }
    } else if (ts.isExportAssignment(st) && !ts.isIdentifier(st.expression)) {
      if (isFn(st.expression) || ts.isClassExpression(st.expression))
        add(st, {
          name: "default",
          kind: isFn(st.expression) ? "function" : "class",
          exported: true,
          isDefault: true,
          parent: null,
        });
    }
  };

  const importOf = (st: import("typescript").Statement) => {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const clause = st.importClause;
      const specifier = st.moduleSpecifier.text;
      const at = line(st.getStart(sf));
      if (!clause) return imports.push({ specifier, kind: "side_effect", bindings: [], line: at });
      if (clause.name)
        imports.push({
          specifier,
          kind: "default",
          bindings: [{ imported: "default", local: clause.name.text }],
          line: at,
        });
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb))
        imports.push({
          specifier,
          kind: "namespace",
          bindings: [{ imported: "*", local: nb.name.text }],
          line: at,
        });
      else if (nb && ts.isNamedImports(nb)) {
        imports.push({
          specifier,
          kind: "named",
          bindings: nb.elements.map((e) => ({
            imported: (e.propertyName ?? e.name).text,
            local: e.name.text,
          })),
          line: at,
        });
      }
    } else if (
      ts.isExportDeclaration(st) &&
      st.moduleSpecifier &&
      ts.isStringLiteral(st.moduleSpecifier)
    ) {
      const specifier = st.moduleSpecifier.text;
      const bindings =
        st.exportClause && ts.isNamedExports(st.exportClause)
          ? st.exportClause.elements.map((e) => ({
              imported: (e.propertyName ?? e.name).text,
              local: e.name.text,
            }))
          : st.exportClause && ts.isNamespaceExport(st.exportClause)
            ? // "export * as ns from": a namespace under one name, not every name of the module.
              [{ imported: "*", local: st.exportClause.name.text }]
            : [{ imported: "*", local: "*" }];
      imports.push({ specifier, kind: "reexport", bindings, line: line(st.getStart(sf)) });
    }
  };

  for (const st of sf.statements) {
    importOf(st);
    declare(st);
  }

  // Calls, attributed to the innermost named function or method they sit in.
  const owner = new Map<import("typescript").Node, number>();
  // Symbols are fixed by now; find the one a node declares by name and line, in one step.
  const bySpot = new Map<string, number[]>();
  symbols.forEach((sym, i) => {
    const key = `${sym.name}@${sym.startLine}`;
    bySpot.set(key, [...(bySpot.get(key) ?? []), i]);
  });
  const note = (node: import("typescript").Node, name: string, kindWanted: SymbolKind[]) => {
    const spot = bySpot.get(`${clean(name)}@${line(node.getStart(sf))}`) ?? [];
    const i = spot.find((idx) => kindWanted.includes(symbols[idx].kind));
    if (i !== undefined) owner.set(node, i);
  };
  // Names bound inside functions (parameters, local variables, nested functions, catch variables).
  // A call to such a name is a call to the local thing, never to the import or top-level symbol
  // of the same name, so it is not recorded; a method called on a local gets no qualifier to match.
  type Node = import("typescript").Node;
  const isFunctionLike = (n: Node) =>
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isConstructorDeclaration(n) ||
    ts.isGetAccessor(n) ||
    ts.isSetAccessor(n);
  const bindingNames = (name: import("typescript").BindingName, out: Set<string>) => {
    if (ts.isIdentifier(name)) out.add(name.text);
    else
      for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out);
  };
  const collectLocals = (fn: import("typescript").SignatureDeclaration): Set<string> => {
    const out = new Set<string>();
    for (const p of fn.parameters) bindingNames(p.name, out);
    if (ts.isFunctionExpression(fn) && fn.name) out.add(fn.name.text);
    const walk = (n: Node) => {
      if (n !== fn && isFunctionLike(n)) {
        if (ts.isFunctionDeclaration(n) && n.name) out.add(n.name.text);
        return;
      }
      if (ts.isVariableDeclaration(n)) bindingNames(n.name, out);
      else if (ts.isClassDeclaration(n) && n.name) out.add(n.name.text);
      else if (ts.isCatchClause(n) && n.variableDeclaration)
        bindingNames(n.variableDeclaration.name, out);
      ts.forEachChild(n, walk);
    };
    if ("body" in fn && fn.body) walk(fn.body as Node);
    return out;
  };
  const scopes: Set<string>[] = [];
  const isLocal = (name: string) => scopes.some((sc) => sc.has(name));

  const visit = (node: import("typescript").Node, current: number | null) => {
    let here = current;
    const scoped = isFunctionLike(node);
    if (scoped) scopes.push(collectLocals(node as import("typescript").SignatureDeclaration));
    if (ts.isFunctionDeclaration(node) && node.name) {
      note(node, node.name.text, ["function"]);
    } else if (ts.isClassDeclaration(node) && node.name) {
      note(node, node.name.text, ["class"]);
    } else if (
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node)
    ) {
      const nm = ts.isConstructorDeclaration(node)
        ? "constructor"
        : node.name && "text" in node.name
          ? (node.name as { text: string }).text
          : "";
      if (nm) note(node, nm, ["method"]);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      isFn(node.initializer)
    ) {
      note(node, node.name.text, ["function"]);
    } else if (
      ts.isPropertyDeclaration(node) &&
      node.name &&
      "text" in node.name &&
      isFn(node.initializer)
    ) {
      note(node, (node.name as { text: string }).text, ["method"]);
    }
    const mine = owner.get(node);
    if (mine !== undefined && symbols[mine].kind !== "class") here = mine;

    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression;
      if (ts.isCallExpression(node) && callee.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg))
          imports.push({
            specifier: arg.text,
            kind: "side_effect",
            bindings: [],
            line: line(node.getStart(sf)),
          });
      } else if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(callee) &&
        callee.text === "require"
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg))
          imports.push({
            specifier: arg.text,
            kind: "side_effect",
            bindings: [],
            line: line(node.getStart(sf)),
          });
      } else if (calls.length < MAX_CALLS) {
        if (ts.isIdentifier(callee)) {
          if (!isLocal(callee.text)) {
            calls.push({
              caller: here,
              name: callee.text,
              qualifier: null,
              line: line(node.getStart(sf)),
            });
          }
        } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
          const q = callee.expression;
          const qualifier =
            q.kind === ts.SyntaxKind.ThisKeyword
              ? "this"
              : ts.isIdentifier(q)
                ? isLocal(q.text)
                  ? "*local" // a local object: only the method's name can say anything about the call
                  : q.text
                : null;
          calls.push({
            caller: here,
            name: callee.name.text,
            qualifier,
            line: line(node.getStart(sf)),
          });
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, here));
    if (scoped) scopes.pop();
  };
  visit(sf, null);

  return {
    symbols,
    imports: imports.slice(0, MAX_IMPORTS).map((i) => ({
      ...i,
      specifier: clean(i.specifier, 300),
      bindings: i.bindings.map((b) => ({ imported: clean(b.imported), local: clean(b.local) })),
    })),
    calls: calls.map((c) => ({
      ...c,
      name: clean(c.name),
      qualifier: c.qualifier === null ? null : clean(c.qualifier, 100),
    })),
    lineCount: sf.getLineAndCharacterOfPosition(sf.end).line + 1,
  };
}

/**
 * Import aliases from a tsconfig ("@/*" to "src/*"), as { "@/": "src/" }. The file is read as JSON
 * with comments, never executed. Only wildcard aliases that end in "/*" are understood.
 */
export async function parseAliases(text: string): Promise<Record<string, string>> {
  const ts = await loadTs();
  const { config } = ts.parseConfigFileTextToJson("tsconfig.json", text);
  const options = (config?.compilerOptions ?? {}) as {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
  const out: Record<string, string> = {};
  const base = (options.baseUrl ?? ".").replace(/^\.\/?/, "").replace(/\/+$/, "");
  for (const [key, targets] of Object.entries(options.paths ?? {})) {
    const target = targets?.[0];
    if (!key.endsWith("/*") || typeof target !== "string" || !target.endsWith("/*")) continue;
    const dir = target.slice(0, -1).replace(/^\.\//, "");
    out[key.slice(0, -1)] = base ? `${base}/${dir}` : dir;
  }
  return out;
}
