import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Locale } from "@/i18n/locales";

/**
 * The user guides, written for two readers: the team that runs projects ("owner") and the
 * clients who follow them on the portal ("client"). One Markdown file per page, audience and
 * language in `src/content/docs/<audience>/<locale>/`, and the screenshots they show in
 * `src/content/docs/assets/<audience>/`. A file starts with a small header between `---`
 * lines: title, description, order, updated.
 */

export const DOC_AUDIENCES = ["owner", "client"] as const;
export type DocAudience = (typeof DOC_AUDIENCES)[number];
export const isDocAudience = (value: string): value is DocAudience =>
  (DOC_AUDIENCES as readonly string[]).includes(value);

const ROOT = path.join(process.cwd(), "src", "content", "docs");

/** A page name is lowercase words and dashes: nothing that could point outside the folder. */
export const DOC_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A screenshot name: lowercase words, dashes and digits, always a .png. */
export const DOC_ASSET = /^[a-z0-9]+(-[a-z0-9]+)*\.png$/;

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  order: number;
  /** ISO date of the last review of the page against the product. */
  updated: string;
}

export interface DocPage extends DocMeta {
  body: string;
}

/** Splits the header from the text. Pure, so it is tested without files. */
export function parseDoc(slug: string, source: string): DocPage | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) return null;
  const header: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0)
      header[line.slice(0, i).trim()] = line
        .slice(i + 1)
        .trim()
        .replace(/^"|"$/g, "");
  }
  const { title, description, order, updated } = header;
  if (!title || !description || !updated || !Number.isFinite(Number(order))) return null;
  return { slug, title, description, order: Number(order), updated, body: match[2].trim() };
}

export function listDocs(audience: DocAudience, locale: Locale): DocMeta[] {
  let files: string[];
  try {
    files = readdirSync(path.join(ROOT, audience, locale));
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".md") && DOC_SLUG.test(f.slice(0, -3)))
    .flatMap((f) => {
      const page = getDoc(audience, locale, f.slice(0, -3));
      if (!page) return [];
      const { body: _body, ...meta } = page;
      return [meta];
    })
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

export function getDoc(audience: DocAudience, locale: Locale, slug: string): DocPage | null {
  if (!DOC_SLUG.test(slug)) return null;
  try {
    return parseDoc(slug, readFileSync(path.join(ROOT, audience, locale, `${slug}.md`), "utf8"));
  } catch {
    return null;
  }
}

/** Where a screenshot lives on disk, or null when the name is not a plain screenshot name. */
export function docAssetFile(audience: DocAudience, name: string): string | null {
  return DOC_ASSET.test(name) ? path.join(ROOT, "assets", audience, name) : null;
}

/** The URL a page uses for a screenshot: served only to people who may read that audience's guides. */
export const docAssetUrl = (audience: DocAudience, name: string) =>
  `/api/docs/assets/${audience}/${name}`;
