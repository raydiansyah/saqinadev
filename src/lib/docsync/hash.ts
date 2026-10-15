import { createHash } from "node:crypto";

/**
 * Line endings, trailing spaces and the number of final newlines differ between editors and
 * Git hosts. None of them is a real change, so content is normalized before it is compared.
 */
export function normalizeContent(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""));
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

export const hashContent = (text: string) =>
  createHash("sha256").update(normalizeContent(text)).digest("hex");
