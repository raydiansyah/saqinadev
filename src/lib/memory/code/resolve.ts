import type { ImportBinding, ImportKind, SymbolKind } from "@/lib/db/schema";

/**
 * Joins what each file says about itself: which file an import points at, and which symbol a call
 * reaches. Pure. A call is linked only when the syntax and the imports point at one symbol;
 * everything else stays "name only" and is reported as such, never as a fact.
 */

export interface LinkFile {
  id: string;
  path: string;
}
export interface LinkSymbol {
  id: string;
  fileId: string;
  name: string;
  kind: SymbolKind;
  exported: boolean;
  isDefault: boolean;
  parentId: string | null;
}
export interface LinkImport {
  id: string;
  fileId: string;
  specifier: string;
  kind: ImportKind;
  bindings: ImportBinding[];
}
export interface LinkCall {
  id: string;
  fileId: string;
  callerSymbolId: string | null;
  name: string;
  qualifier: string | null;
}

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];

/** Joins a relative path onto a directory. null when it climbs out of the repository. */
const join = (dir: string, rel: string): string | null => {
  const parts = dir ? dir.split("/") : [];
  for (const p of rel.split("/")) {
    if (p === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (p && p !== ".") parts.push(p);
  }
  return parts.join("/");
};

/** The file in `paths` a specifier points at, or null (a package, or not in this index). */
export function resolveSpecifier(
  fromPath: string,
  specifier: string,
  aliases: Record<string, string>,
  paths: ReadonlySet<string>,
): string | null {
  let base: string | null = null;
  if (specifier.startsWith(".")) {
    base = join(fromPath.split("/").slice(0, -1).join("/"), specifier);
  } else {
    const prefix = Object.keys(aliases)
      .filter((p) => specifier.startsWith(p))
      .sort((a, b) => b.length - a.length)[0];
    if (prefix !== undefined)
      base = join("", `${aliases[prefix]}${specifier.slice(prefix.length)}`);
  }
  if (base === null) return null;
  // TypeScript writes "./x.js" for a file called x.ts.
  const stripped = base.replace(/\.(m|c)?jsx?$/, "");
  const stems = stripped === base ? [base] : [stripped, base];
  for (const stem of stems) {
    if (paths.has(stem)) return stem;
    for (const ext of EXTENSIONS) if (paths.has(`${stem}${ext}`)) return `${stem}${ext}`;
    for (const ext of EXTENSIONS)
      if (paths.has(`${stem}/index${ext}`)) return `${stem}/index${ext}`;
  }
  return null;
}

export interface Linked {
  /** import id to the file it points at (null when it points outside the index). */
  importTargets: Map<string, string | null>;
  /** call id to the one symbol it reaches. Calls not in this map are name-only. */
  callTargets: Map<string, string>;
}

export function linkGraph(
  files: LinkFile[],
  symbols: LinkSymbol[],
  imports: LinkImport[],
  calls: LinkCall[],
  aliases: Record<string, string>,
): Linked {
  const byPath = new Map(files.map((f) => [f.path, f.id]));
  const pathSet = new Set(byPath.keys());
  const pathOf = new Map(files.map((f) => [f.id, f.path]));

  const importTargets = new Map<string, string | null>();
  const importsOf = new Map<string, (LinkImport & { target: string | null })[]>();
  for (const imp of imports) {
    const from = pathOf.get(imp.fileId);
    const resolved = from ? resolveSpecifier(from, imp.specifier, aliases, pathSet) : null;
    const target = resolved ? (byPath.get(resolved) ?? null) : null;
    importTargets.set(imp.id, target);
    const list = importsOf.get(imp.fileId) ?? [];
    list.push({ ...imp, target });
    importsOf.set(imp.fileId, list);
  }

  const symbolsOf = new Map<string, LinkSymbol[]>();
  for (const s of symbols) {
    const list = symbolsOf.get(s.fileId) ?? [];
    list.push(s);
    symbolsOf.set(s.fileId, list);
  }
  const byId = new Map(symbols.map((s) => [s.id, s]));

  // The one exported symbol called `name` in a file, following re-exports a few levels.
  const exportedIn = (
    fileId: string,
    name: string,
    depth = 0,
    visited: Set<string> = new Set(),
  ): LinkSymbol | null => {
    // A file is looked at once per lookup: a mesh of barrels cannot make this grow with its fan-out.
    if (visited.has(fileId)) return null;
    visited.add(fileId);
    const own = (symbolsOf.get(fileId) ?? []).filter(
      (s) =>
        s.parentId === null && s.exported && (name === "default" ? s.isDefault : s.name === name),
    );
    if (own.length === 1) return own[0];
    if (own.length > 1 || depth >= 4) return null;
    for (const imp of importsOf.get(fileId) ?? []) {
      if (imp.kind !== "reexport" || !imp.target) continue;
      for (const b of imp.bindings) {
        // Only `export * from` carries every name. `export * as ns from` carries one, called ns.
        if (b.imported === "*" && b.local === "*") {
          const found = exportedIn(imp.target, name, depth + 1, visited);
          if (found) return found;
        } else if (b.imported !== "*" && b.local === name) {
          const found = exportedIn(imp.target, b.imported, depth + 1, visited);
          if (found) return found;
        }
      }
    }
    return null;
  };

  const topLevel = (fileId: string, name: string) => {
    const hit = (symbolsOf.get(fileId) ?? []).filter(
      (s) => s.parentId === null && s.name === name && s.kind !== "interface" && s.kind !== "type",
    );
    return hit.length === 1 ? hit[0] : null;
  };
  const methodOf = (cls: LinkSymbol, name: string) => {
    const hit = (symbolsOf.get(cls.fileId) ?? []).filter(
      (s) => s.parentId === cls.id && s.name === name,
    );
    return hit.length === 1 ? hit[0] : null;
  };
  // What a local name in a file stands for: its own declaration, or an import binding.
  const meaning = (fileId: string, local: string): LinkSymbol | { namespaceOf: string } | null => {
    const own = topLevel(fileId, local);
    if (own) return own;
    for (const imp of importsOf.get(fileId) ?? []) {
      if (!imp.target) continue;
      for (const b of imp.bindings) {
        if (b.local !== local || imp.kind === "reexport") continue;
        if (imp.kind === "namespace") return { namespaceOf: imp.target };
        return exportedIn(imp.target, b.imported);
      }
    }
    return null;
  };

  const callTargets = new Map<string, string>();
  for (const call of calls) {
    let target: LinkSymbol | null = null;
    if (call.qualifier === null) {
      const m = meaning(call.fileId, call.name);
      target = m && "id" in m ? m : null;
    } else if (call.qualifier === "this") {
      const caller = call.callerSymbolId ? byId.get(call.callerSymbolId) : undefined;
      const cls = caller?.parentId ? byId.get(caller.parentId) : undefined;
      target = cls ? methodOf(cls, call.name) : null;
    } else {
      const m = meaning(call.fileId, call.qualifier);
      if (m && "namespaceOf" in m) target = exportedIn(m.namespaceOf, call.name);
      else if (m && m.kind === "class") target = methodOf(m, call.name);
    }
    if (target) callTargets.set(call.id, target.id);
  }
  return { importTargets, callTargets };
}

/** Test files by where they live and what they are called. */
export const isTestPath = (path: string) =>
  /(^|\/)(__tests__|tests?|e2e|spec)\//i.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(path);
