/**
 * Pattern-based secret detection for text leaving the server boundary (logs, context
 * packages, tool output, audit metadata). Catches common key formats; the real protection is
 * that secrets are only ever read inside `withSecret`.
 */
const PATTERNS = [
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, // OpenAI / Anthropic style
  /\bsk-ant-[A-Za-z0-9_-]{16,}/g,
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bglpat-[A-Za-z0-9_-]{16,}/g, // GitLab
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(bearer)\s+[A-Za-z0-9._~+/-]{20,}=*/gi,
];

export function containsSecret(text: string): boolean {
  return PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

export function scrubSecrets(text: string): string {
  let out = text;
  for (const re of PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}

/** Deep scrub for JSON-like values, with a size cap. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string") return scrubSecrets(value);
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubValue(v, depth + 1)]));
  return value;
}
