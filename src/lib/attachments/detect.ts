/** Largest file a message may carry. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/** Text files go into the prompt whole, so they are kept small. */
export const MAX_TEXT_BYTES = 200_000;

const TEXT_EXTENSIONS =
  /\.(md|markdown|txt|csv|tsv|json|ya?ml|toml|xml|log|sql|ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|php|cs|c|h|cpp|hpp|swift|sh|css|scss|env\.example|ini|conf)$/i;

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);

export interface DetectedFile {
  kind: "text" | "image" | "pdf";
  mime: string;
  /** The decoded text of a text file. */
  text?: string;
}

/**
 * The file's real type, read from its first bytes. Only images models can read (PNG, JPEG, WebP,
 * GIF), PDF and plain text are accepted. SVG and HTML are refused even though they are text: a
 * browser runs the script they may carry.
 */
export function detectFile(name: string, bytes: Uint8Array): DetectedFile | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { kind: "image", mime: "image/png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg" };
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return { kind: "image", mime: "image/gif" };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return { kind: "image", mime: "image/webp" };
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    return { kind: "pdf", mime: "application/pdf" };

  if (!TEXT_EXTENSIONS.test(name) || bytes.byteLength > MAX_TEXT_BYTES) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  // Binary disguised as text, or markup a browser would run.
  if (text.includes("\u0000")) return null;
  if (/^\s*(<!doctype html|<html|<svg|<\?xml[^>]*>\s*<svg)/i.test(text)) return null;
  return { kind: "text", mime: "text/plain; charset=utf-8", text };
}
