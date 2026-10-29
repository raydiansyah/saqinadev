import * as z from "zod";
import { AppError } from "@/lib/errors";

/** Bigger skills are refused: a prompt has to fit them alongside the project. */
export const MAX_SKILL_BYTES = 50_000;

const frontmatter = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  description: z.string().trim().min(1).max(1024),
});

export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
}

const unquote = (v: string) => v.trim().replace(/^(["'])([\s\S]*)\1$/, "$2");

/**
 * Reads a SKILL.md: a `---` block with `name` and `description`, then the instructions. Only
 * those two keys are read; anything else in the block is ignored, never executed.
 */
export function parseSkillMd(text: string): ParsedSkill {
  if (new TextEncoder().encode(text).length > MAX_SKILL_BYTES)
    throw new AppError("VALIDATION_ERROR", "Skill too large", { content: "tooLarge" });
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) throw new AppError("VALIDATION_ERROR", "No frontmatter", { content: "frontmatter" });
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = unquote(kv[2]);
  }
  const parsed = frontmatter.safeParse(fields);
  if (!parsed.success)
    throw new AppError("VALIDATION_ERROR", "Bad frontmatter", { content: "frontmatter" });
  const body = match[2].trim();
  if (!body) throw new AppError("VALIDATION_ERROR", "Empty skill", { content: "empty" });
  return { ...parsed.data, body };
}

/**
 * A GitHub link to a SKILL.md (or its folder), turned into the raw file URL. Only github.com and
 * raw.githubusercontent.com are accepted, so an install never reaches any other host.
 */
export function normalizeGithubSkillUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid URL", { url: "invalid" });
  }
  if (url.protocol !== "https:")
    throw new AppError("VALIDATION_ERROR", "https required", { url: "invalid" });
  const parts = url.pathname.split("/").filter(Boolean);
  const safe = (p: string) => /^[\w.-]+$/.test(p) && p !== "..";
  if (!parts.every(safe)) throw new AppError("VALIDATION_ERROR", "Bad path", { url: "invalid" });
  if (url.hostname === "raw.githubusercontent.com") {
    if (parts.length < 4 || parts.at(-1) !== "SKILL.md")
      throw new AppError("VALIDATION_ERROR", "Not a SKILL.md", { url: "notSkill" });
    return `https://raw.githubusercontent.com/${parts.join("/")}`;
  }
  if (url.hostname !== "github.com")
    throw new AppError("VALIDATION_ERROR", "GitHub only", { url: "githubOnly" });
  // owner/repo/(blob|tree)/ref/path...
  const [owner, repo, kind, ref, ...path] = parts;
  if (!owner || !repo || (kind !== "blob" && kind !== "tree") || !ref)
    throw new AppError("VALIDATION_ERROR", "Not a file link", { url: "notSkill" });
  const file = path.at(-1) === "SKILL.md" ? path : [...path, "SKILL.md"];
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${file.join("/")}`;
}
